//! Prerequisite detection: Obsidian + git.
//!
//! Both must be installed before InterBrain can do anything useful. Neither
//! ships inside the bundle (Obsidian for license/size; git because it's
//! universally available via OS-native installers). The daemon detects what's
//! missing and points the user at the right install path per platform.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrerequisiteStatus {
    pub obsidian: DependencyStatus,
    pub git: DependencyStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyStatus {
    pub installed: bool,
    /// User-facing path or version string for display.
    pub detail: Option<String>,
    /// URL to point the user at to download/install. None when already installed.
    #[serde(rename = "installUrl")]
    pub install_url: Option<String>,
    /// Optional shell command we can suggest to install (macOS: xcode-select,
    /// Linux: apt-get install). Frontend can offer a "Run for me" button.
    #[serde(rename = "installCommand")]
    pub install_command: Option<String>,
}

pub fn detect() -> PrerequisiteStatus {
    PrerequisiteStatus {
        obsidian: detect_obsidian(),
        git: detect_git(),
    }
}

fn detect_obsidian() -> DependencyStatus {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if cfg!(target_os = "macos") {
        candidates.push(PathBuf::from("/Applications/Obsidian.app"));
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join("Applications/Obsidian.app"));
        }
    } else if cfg!(target_os = "windows") {
        candidates.push(PathBuf::from("C:\\Program Files\\Obsidian\\Obsidian.exe"));
        candidates.push(PathBuf::from("C:\\Program Files (x86)\\Obsidian\\Obsidian.exe"));
        if let Some(local) = dirs::data_local_dir() {
            // %LOCALAPPDATA%\Programs\Obsidian\Obsidian.exe — the per-user
            // install location that winget's `--scope user` (and Obsidian's
            // own installer when run without admin) writes to.
            candidates.push(local.join("Programs\\Obsidian\\Obsidian.exe"));
            candidates.push(local.join("Obsidian\\Obsidian.exe"));
        }
    }

    if let Some(found) = candidates.iter().find(|p| p.exists()) {
        return DependencyStatus {
            installed: true,
            detail: Some(found.display().to_string()),
            install_url: None,
            install_command: None,
        };
    }

    // Linux + cross-platform fallback: check PATH for an `obsidian` binary.
    if let Ok(p) = which::which("obsidian") {
        return DependencyStatus {
            installed: true,
            detail: Some(p.display().to_string()),
            install_url: None,
            install_command: None,
        };
    }

    DependencyStatus {
        installed: false,
        detail: None,
        install_url: Some("https://obsidian.md/download".to_string()),
        install_command: None,
    }
}

fn detect_git() -> DependencyStatus {
    if let Ok(p) = which::which("git") {
        // Read version for display.
        let version = std::process::Command::new(&p)
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| if o.status.success() { Some(String::from_utf8_lossy(&o.stdout).trim().to_string()) } else { None });
        return DependencyStatus {
            installed: true,
            detail: version,
            install_url: None,
            install_command: None,
        };
    }

    let (url, cmd) = if cfg!(target_os = "macos") {
        // macOS ships Xcode CLT git. xcode-select --install opens the GUI prompt.
        (
            Some("https://git-scm.com/download/mac".to_string()),
            Some("xcode-select --install".to_string()),
        )
    } else if cfg!(target_os = "windows") {
        (Some("https://git-scm.com/download/win".to_string()), None)
    } else {
        (
            Some("https://git-scm.com/download/linux".to_string()),
            Some("sudo apt-get install -y git".to_string()),
        )
    };

    DependencyStatus {
        installed: false,
        detail: None,
        install_url: url,
        install_command: cmd,
    }
}
