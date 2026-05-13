//! Cross-platform dependency installer.
//!
//! Strategy: package-manager-first with sensible fallbacks.
//!   - macOS: Homebrew. Bootstrap brew itself if missing (admin password
//!     elevation via AppleScript native dialog). Then `brew install git`,
//!     `brew install --cask obsidian`.
//!   - Windows: winget. Bootstrap winget itself if missing (download
//!     Microsoft's official package installer). Then
//!     `winget install Git.Git` and `winget install Obsidian.Obsidian`.
//!   - Linux: detect distro, use apt/dnf/pacman for git; AppImage for
//!     Obsidian (since neither .deb nor Flatpak works everywhere).
//!
//! Each install streams progress events back over the IPC bus so the UI
//! shows a live checklist:  "Installing Homebrew" → "Installing git" → etc.

use crate::ipc::EventBus;
use serde::Serialize;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Dependency {
    Git,
    Obsidian,
    Gh,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallProgress {
    pub dependency: String,
    pub stage: String,
    /// 0..=1, or None for indeterminate.
    pub progress: Option<f32>,
    pub message: String,
}

pub struct InstallContext {
    pub bus: Arc<EventBus>,
    pub app: AppHandle,
    pub request_id: String,
}

impl InstallContext {
    fn report(&self, dep: Dependency, stage: &str, message: &str, progress: Option<f32>) {
        let dep_str = match dep {
            Dependency::Git => "git",
            Dependency::Obsidian => "obsidian",
            Dependency::Gh => "gh",
        };
        let payload = InstallProgress {
            dependency: dep_str.to_string(),
            stage: stage.to_string(),
            progress,
            message: message.to_string(),
        };
        let value = serde_json::json!({
            "requestId": self.request_id,
            "progress": payload,
        });
        // Emit on BOTH busses:
        //   1. EventBus → reaches plugin clients connected via WebSocket IPC.
        //   2. Tauri app event bus → reaches the daemon's own webviews
        //      (first-run window, tray dashboard) via @tauri-apps/api/event.
        self.bus.emit("install-progress", value.clone());
        let _ = self.app.emit("install-progress", &value);
    }
}

pub async fn install(dep: Dependency, ctx: &InstallContext) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        install_macos(dep, ctx).await
    }
    #[cfg(target_os = "windows")]
    {
        install_windows(dep, ctx).await
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        install_linux(dep, ctx).await
    }
}

// ============================================================================
// macOS
// ============================================================================

#[cfg(target_os = "macos")]
async fn install_macos(dep: Dependency, ctx: &InstallContext) -> Result<(), String> {
    use std::path::Path;

    // 1. Ensure Homebrew is available.
    ctx.report(dep, "checking", "Checking for Homebrew…", None);
    let brew_path = find_brew();
    if brew_path.is_none() {
        ctx.report(dep, "bootstrap", "Installing Homebrew (you'll be prompted for your password)", None);
        bootstrap_homebrew().await
            .map_err(|e| format!("Homebrew install failed: {e}"))?;
    }
    let brew = find_brew().ok_or("Homebrew still not found after bootstrap")?;
    let brew_str = brew.to_string_lossy().to_string();

    // 2. Use brew to install the dependency. Treat "already installed" as success.
    match dep {
        Dependency::Git => {
            ctx.report(dep, "installing", "Installing git via Homebrew…", None);
            if let Err(e) = run_capture(&brew_str, &["install", "git"]).await {
                if e.to_lowercase().contains("already installed") {
                    ctx.report(dep, "done", "Already installed", Some(1.0));
                    return Ok(());
                }
                return Err(format!("brew install git: {e}"));
            }
        }
        Dependency::Obsidian => {
            ctx.report(dep, "installing", "Installing Obsidian via Homebrew…", None);
            if let Err(e) = run_capture(&brew_str, &["install", "--cask", "obsidian"]).await {
                if e.to_lowercase().contains("already installed") {
                    ctx.report(dep, "done", "Already installed", Some(1.0));
                    return Ok(());
                }
                return Err(format!("brew install --cask obsidian: {e}"));
            }
        }
        Dependency::Gh => {
            ctx.report(dep, "installing", "Installing GitHub CLI via Homebrew…", None);
            if let Err(e) = run_capture(&brew_str, &["install", "gh"]).await {
                if e.to_lowercase().contains("already installed") {
                    ctx.report(dep, "done", "Already installed", Some(1.0));
                    return Ok(());
                }
                return Err(format!("brew install gh: {e}"));
            }
        }
    }

    ctx.report(dep, "done", "Installed", Some(1.0));
    Ok(())
}

#[cfg(target_os = "macos")]
fn find_brew() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;
    if let Ok(p) = which::which("brew") { return Some(p); }
    let candidates = [
        "/opt/homebrew/bin/brew",  // Apple Silicon
        "/usr/local/bin/brew",     // Intel
    ];
    for c in candidates {
        let p = PathBuf::from(c);
        if p.exists() { return Some(p); }
    }
    None
}

#[cfg(target_os = "macos")]
async fn bootstrap_homebrew() -> Result<(), String> {
    // Homebrew's official installer wants root privileges to write to
    // /opt/homebrew (Apple Silicon) or /usr/local (Intel) and to install
    // Xcode CLT as a side-effect on a fresh machine.
    //
    // We use AppleScript's "do shell script ... with administrator privileges"
    // which triggers macOS's native password prompt. The user sees an
    // OS-native dialog naming InterBrain — the canonical pattern for
    // privileged installers.
    let install_cmd = r#"NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)""#;
    let osascript_cmd = format!(
        r#"do shell script "{}" with administrator privileges"#,
        install_cmd.replace('"', "\\\"")
    );
    let out = Command::new("osascript").arg("-e").arg(&osascript_cmd).output().await
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(())
}

// ============================================================================
// Windows
// ============================================================================

#[cfg(target_os = "windows")]
async fn install_windows(dep: Dependency, ctx: &InstallContext) -> Result<(), String> {
    // 1. Ensure winget is on PATH.
    ctx.report(dep, "checking", "Checking for winget…", None);
    if which::which("winget").is_err() {
        ctx.report(dep, "bootstrap", "Installing winget (App Installer)", None);
        bootstrap_winget(ctx).await?;
    }

    // 2. Use winget to install.
    let pkg = match dep {
        Dependency::Git => "Git.Git",
        Dependency::Obsidian => "Obsidian.Obsidian",
        Dependency::Gh => "GitHub.cli",
    };
    let label = match dep {
        Dependency::Git => "git",
        Dependency::Obsidian => "Obsidian",
        Dependency::Gh => "GitHub CLI",
    };
    ctx.report(dep, "downloading", &format!("Downloading {label}…"), None);

    // --silent suppresses installer GUI; --accept-* skips agreement prompts.
    // Note: many winget packages (Git in particular) ignore --scope user and
    // install to Program Files anyway, triggering UAC. That's accurate
    // behavior — we don't paper over it; the user sees one OS-native UAC
    // prompt per install, which is the canonical pattern.
    let args = [
        "install", "--id", pkg,
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
    ];
    ctx.report(dep, "installing", &format!("Installing {label} (you may see a UAC prompt)…"), None);
    let result = run_capture("winget", &args).await;
    match result {
        Ok(_) => {}
        Err(e) => {
            // winget exit code 0x8a15002b = "package already installed and no
            // newer version available". Treat as success — the user has the
            // dependency, which is what we want.
            if e.contains("0x8a15002b") || e.to_lowercase().contains("already installed") {
                ctx.report(dep, "done", "Already installed", Some(1.0));
                return Ok(());
            }
            return Err(format!("winget install {pkg}: {e}"));
        }
    }

    ctx.report(dep, "done", "Installed", Some(1.0));
    Ok(())
}

#[cfg(target_os = "windows")]
async fn bootstrap_winget(ctx: &InstallContext) -> Result<(), String> {
    use std::path::PathBuf;

    // Microsoft ships winget as the "App Installer" .msixbundle. Pinning a
    // recent version that's known to install on Win10/Win11.
    let url = "https://aka.ms/getwinget";
    let dest = std::env::temp_dir().join("Microsoft.DesktopAppInstaller.msixbundle");

    ctx.report(Dependency::Git, "bootstrap", "Downloading winget…", None);
    let bytes = reqwest::get(url).await
        .map_err(|e| format!("download winget: {e}"))?
        .bytes().await
        .map_err(|e| format!("read winget: {e}"))?;
    std::fs::write(&dest, &bytes).map_err(|e| format!("write msixbundle: {e}"))?;

    ctx.report(Dependency::Git, "bootstrap", "Installing winget…", None);
    let dest_str: PathBuf = dest;
    let ps_arg = format!("Add-AppxPackage -Path '{}'", dest_str.display());
    let mut ps_cmd = Command::new("powershell");
    ps_cmd.args(["-NoProfile", "-Command", &ps_arg]);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        ps_cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = ps_cmd.output().await
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(format!("Add-AppxPackage failed: {}", String::from_utf8_lossy(&out.stderr)));
    }
    Ok(())
}

// ============================================================================
// Linux
// ============================================================================

#[cfg(all(unix, not(target_os = "macos")))]
async fn install_linux(dep: Dependency, ctx: &InstallContext) -> Result<(), String> {
    let distro = detect_linux_distro();

    match dep {
        Dependency::Git => {
            ctx.report(dep, "installing", &format!("Installing git via {distro:?}"), None);
            match distro {
                LinuxDistro::DebianFamily => {
                    run_capture_sudo("apt-get", &["install", "-y", "git"]).await
                        .map_err(|e| format!("apt-get install git: {e}"))?;
                }
                LinuxDistro::Fedora => {
                    run_capture_sudo("dnf", &["install", "-y", "git"]).await
                        .map_err(|e| format!("dnf install git: {e}"))?;
                }
                LinuxDistro::Arch => {
                    run_capture_sudo("pacman", &["-S", "--noconfirm", "git"]).await
                        .map_err(|e| format!("pacman install git: {e}"))?;
                }
                LinuxDistro::Unknown => {
                    return Err("Unknown Linux distro — install git manually with your package manager.".into());
                }
            }
        }
        Dependency::Obsidian => {
            // Obsidian on Linux: we ship as AppImage. Download + chmod +
            // place in ~/Applications. No package manager dependency.
            ctx.report(dep, "installing", "Downloading Obsidian AppImage", None);
            install_obsidian_appimage().await?;
        }
        Dependency::Gh => {
            ctx.report(dep, "installing", &format!("Installing gh via {distro:?}"), None);
            match distro {
                LinuxDistro::DebianFamily => {
                    run_capture_sudo("apt-get", &["install", "-y", "gh"]).await
                        .map_err(|e| format!("apt-get install gh: {e}"))?;
                }
                LinuxDistro::Fedora => {
                    run_capture_sudo("dnf", &["install", "-y", "gh"]).await
                        .map_err(|e| format!("dnf install gh: {e}"))?;
                }
                LinuxDistro::Arch => {
                    run_capture_sudo("pacman", &["-S", "--noconfirm", "github-cli"]).await
                        .map_err(|e| format!("pacman install github-cli: {e}"))?;
                }
                LinuxDistro::Unknown => {
                    return Err("Unknown Linux distro — install gh manually from https://cli.github.com/".into());
                }
            }
        }
    }

    ctx.report(dep, "done", "Installed", Some(1.0));
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
#[derive(Debug)]
enum LinuxDistro { DebianFamily, Fedora, Arch, Unknown }

#[cfg(all(unix, not(target_os = "macos")))]
fn detect_linux_distro() -> LinuxDistro {
    let osr = std::fs::read_to_string("/etc/os-release").unwrap_or_default();
    let lower = osr.to_lowercase();
    if lower.contains("ubuntu") || lower.contains("debian") || lower.contains("mint") {
        LinuxDistro::DebianFamily
    } else if lower.contains("fedora") || lower.contains("rhel") || lower.contains("centos") {
        LinuxDistro::Fedora
    } else if lower.contains("arch") || lower.contains("manjaro") {
        LinuxDistro::Arch
    } else {
        LinuxDistro::Unknown
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
async fn run_capture_sudo(cmd: &str, args: &[&str]) -> Result<String, String> {
    // pkexec gives a graphical password prompt on most desktop Linuxes.
    let mut full: Vec<&str> = vec![cmd];
    full.extend_from_slice(args);
    if which::which("pkexec").is_ok() {
        run_capture("pkexec", &full).await
    } else {
        // Fall back to sudo (interactive) — won't work in non-tty contexts
        // but is the honest path when pkexec is missing.
        run_capture("sudo", &full).await
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
async fn install_obsidian_appimage() -> Result<(), String> {
    // Pinned to a known-good version. Update over time.
    let url = "https://github.com/obsidianmd/obsidian-releases/releases/latest/download/Obsidian-x86_64.AppImage";
    let home = dirs::home_dir().ok_or("no home dir")?;
    let app_dir = home.join("Applications");
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let dest = app_dir.join("Obsidian.AppImage");

    let bytes = reqwest::get(url).await
        .map_err(|e| format!("download Obsidian: {e}"))?
        .bytes().await
        .map_err(|e| format!("read Obsidian: {e}"))?;
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;

    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// Helpers
// ============================================================================

async fn run_capture(cmd: &str, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new(cmd);
    command.args(args);
    // On Windows, suppress the console window that would otherwise pop up
    // for each child process (winget, msiexec, installer .exe's).
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let out = command.output().await
        .map_err(|e| format!("spawn {cmd}: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!("{cmd} exited {}: {}\n{}", out.status, stderr.trim(), stdout.trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}
