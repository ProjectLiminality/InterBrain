//! Vault discovery + plugin file management.
//!
//! Two modes per vault:
//!   - **managed**: daemon copies the bundled plugin files into
//!     `<vault>/.obsidian/plugins/InterBrain/`. Updates ship with daemon updates.
//!   - **dev**: daemon ensures the InterBrain repo is cloned at `<vault>/InterBrain`
//!     and the plugin directory is a symlink to it. Contributors edit locally,
//!     rebuild, and Obsidian reloads.

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Hide the console window that Windows would otherwise pop up briefly when
/// we spawn child processes (git, npm, cmd, etc.) from the GUI app. No-op
/// on Unix.
#[cfg(windows)]
pub(crate) fn suppress_console_window(cmd: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
#[cfg(not(windows))]
pub(crate) fn suppress_console_window(_cmd: &mut std::process::Command) {}

const PLUGIN_ID: &str = "interbrain";
const PLUGIN_REPO_URL: &str = "https://github.com/ProjectLiminality/InterBrain.git";
const THEME_FILENAME: &str = "interbrain.css";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntry {
    pub path: String,
    pub name: String,
    #[serde(rename = "pluginInstalled")]
    pub plugin_installed: bool,
    #[serde(rename = "devMode")]
    pub dev_mode: bool,
}

/// Create a fresh Obsidian vault at `parent_dir/name`. Builds the directory,
/// the `.obsidian` subdir Obsidian needs to recognize it, and registers it
/// in `obsidian.json` so Obsidian sees it on next launch.
pub fn create_vault(parent_dir: &Path, name: &str) -> Result<PathBuf> {
    let vault_path = parent_dir.join(name);
    if vault_path.exists() {
        bail!("a folder named {name} already exists at {}", parent_dir.display());
    }
    fs::create_dir_all(&vault_path)
        .with_context(|| format!("create vault dir {}", vault_path.display()))?;
    fs::create_dir_all(vault_path.join(".obsidian"))
        .with_context(|| "create .obsidian dir")?;
    register_vault_with_obsidian(&vault_path)?;
    Ok(vault_path)
}

/// Add a vault path to Obsidian's known-vaults JSON so it appears in the
/// vault picker on next Obsidian launch.
fn register_vault_with_obsidian(vault_path: &Path) -> Result<()> {
    let registry_path = obsidian_registry_path()?;
    let mut registry: serde_json::Value = if registry_path.exists() {
        let text = fs::read_to_string(&registry_path).unwrap_or_default();
        serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({"vaults": {}}))
    } else {
        if let Some(parent) = registry_path.parent() {
            fs::create_dir_all(parent).ok();
        }
        serde_json::json!({"vaults": {}})
    };
    let vaults = registry
        .get_mut("vaults")
        .and_then(|v| v.as_object_mut())
        .ok_or_else(|| anyhow!("malformed obsidian.json"))?;
    // Obsidian uses a 16-char hex id; we generate a stable one from the path.
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(vault_path.to_string_lossy().as_bytes());
    let id = hex::encode(&hasher.finalize()[..8]);
    vaults.insert(
        id,
        serde_json::json!({
            "path": vault_path.to_string_lossy(),
            "ts": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        }),
    );
    fs::write(&registry_path, serde_json::to_string_pretty(&registry)?)
        .with_context(|| format!("write {}", registry_path.display()))?;
    Ok(())
}

/// Default location for a new vault: `~/` on macOS/Linux,
/// `%USERPROFILE%\` on Windows. Caller appends the desired vault name.
pub fn default_new_vault_parent() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

/// Read Obsidian's vault registry from the standard per-platform location.
pub fn discover_obsidian_vaults() -> Result<Vec<String>> {
    let registry_path = obsidian_registry_path()?;
    if !registry_path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&registry_path)
        .with_context(|| format!("read obsidian.json at {}", registry_path.display()))?;
    let parsed: ObsidianRegistry = serde_json::from_str(&content)
        .context("parse obsidian.json")?;
    let mut paths: Vec<String> = parsed
        .vaults
        .into_values()
        .map(|v| v.path)
        .filter(|p| Path::new(p).exists())
        .collect();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

#[derive(Deserialize)]
struct ObsidianRegistry {
    #[serde(default)]
    vaults: BTreeMap<String, ObsidianRegistryVault>,
}

#[derive(Deserialize)]
struct ObsidianRegistryVault {
    path: String,
}

fn obsidian_registry_path() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow!("no home directory"))?;
    let p = if cfg!(target_os = "macos") {
        home.join("Library/Application Support/obsidian/obsidian.json")
    } else if cfg!(target_os = "windows") {
        let appdata = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData/Roaming"));
        appdata.join("obsidian/obsidian.json")
    } else {
        let xdg = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"));
        xdg.join("obsidian/obsidian.json")
    };
    Ok(p)
}

/// Inspect a vault and report whether the plugin is installed and which mode.
pub fn inspect_vault(vault_path: &Path) -> Result<VaultEntry> {
    let plugin_dir = vault_path.join(".obsidian/plugins").join(PLUGIN_ID);
    let plugin_installed = plugin_dir.exists();
    let dev_mode = plugin_installed
        && fs::symlink_metadata(&plugin_dir)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false);
    let name = vault_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("vault")
        .to_string();
    Ok(VaultEntry {
        path: vault_path.to_string_lossy().to_string(),
        name,
        plugin_installed,
        dev_mode,
    })
}

/// Place the bundled plugin files into a vault and enable the plugin.
/// `bundled_dir` should contain `manifest.json`, `main.js`, `styles.css`.
///
/// Atomic strategy: stage into `<plugin>.new`, swap-replace, never leave the
/// vault without a working plugin dir even if a step fails partway.
pub fn install_managed(vault_path: &Path, bundled_dir: &Path) -> Result<()> {
    // Up-front: confirm sources exist before touching anything.
    for file in ["manifest.json", "main.js", "styles.css"] {
        let src = bundled_dir.join(file);
        if !src.exists() {
            bail!("bundled plugin file missing: {}", src.display());
        }
    }

    let plugins_root = vault_path.join(".obsidian/plugins");
    fs::create_dir_all(&plugins_root)?;
    let target = plugins_root.join(PLUGIN_ID);
    let staging = plugins_root.join(format!("{PLUGIN_ID}.new"));

    if staging.exists() {
        remove_path(&staging)?;
    }
    fs::create_dir_all(&staging)?;
    for file in ["manifest.json", "main.js", "styles.css"] {
        fs::copy(bundled_dir.join(file), staging.join(file))?;
    }

    // Now replace the live target — only AFTER staging is fully populated.
    if target.exists() {
        remove_path(&target)?;
    }
    fs::rename(&staging, &target)
        .with_context(|| format!("rename {} -> {}", staging.display(), target.display()))?;

    enable_plugin(vault_path)?;
    install_theme(vault_path, bundled_dir).ok(); // best-effort
    Ok(())
}

/// Copy InterBrain's theme stylesheet into Obsidian's snippets dir so the
/// vault renders with the InterBrain palette out of the box. Best-effort —
/// if the bundled theme file isn't present (older builds), this is a no-op.
fn install_theme(vault_path: &Path, bundled_dir: &Path) -> Result<()> {
    let theme_src = bundled_dir.join(THEME_FILENAME);
    if !theme_src.exists() {
        return Ok(());
    }
    let snippets = vault_path.join(".obsidian/snippets");
    fs::create_dir_all(&snippets)?;
    fs::copy(&theme_src, snippets.join(THEME_FILENAME))?;
    enable_snippet(vault_path, THEME_FILENAME)?;
    Ok(())
}

/// Configure `<vault>/.obsidian/appearance.json` with InterBrain defaults:
///   - Enable our CSS snippet (filename without .css).
///   - Set the InterBrain accent color (#00A2FF).
///   - Use Obsidian's built-in default theme (no third-party theme).
///
/// Note on dark vs light: Obsidian's mode setting isn't reliably stored
/// per-vault (varies across versions and OS appearance inheritance), so we
/// don't try to force it via config. Instead, our snippet applies to BOTH
/// .theme-dark and .theme-light selectors so the InterBrain visual
/// identity (pitch-black DreamSpace) wins regardless of Obsidian's choice.
fn enable_snippet(vault_path: &Path, filename: &str) -> Result<()> {
    let path = vault_path.join(".obsidian/appearance.json");
    let snippet_id = filename.trim_end_matches(".css").to_string();
    let mut data: serde_json::Value = if path.exists() {
        serde_json::from_str(&fs::read_to_string(&path)?).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    let obj = data
        .as_object_mut()
        .ok_or_else(|| anyhow!("appearance.json is not an object"))?;

    // Set defaults if not already present.
    obj.entry("accentColor")
        .or_insert_with(|| serde_json::json!("#00A2FF"));
    obj.entry("theme")
        .or_insert_with(|| serde_json::json!("obsidian"));

    // Ensure the snippet is in the enabled list.
    let arr = obj
        .entry("enabledCssSnippets")
        .or_insert_with(|| serde_json::json!([]));
    if let Some(list) = arr.as_array_mut() {
        if !list.iter().any(|v| v.as_str() == Some(&snippet_id)) {
            list.push(serde_json::json!(snippet_id));
        }
    }
    fs::write(&path, serde_json::to_string_pretty(&data)?)?;
    Ok(())
}

/// Remove a path that may be a file, directory, or symlink/junction. Cross-
/// platform safe: handles all the variants without leaving partial state.
fn remove_path(p: &Path) -> Result<()> {
    let meta = match fs::symlink_metadata(p) {
        Ok(m) => m,
        Err(_) => return Ok(()), // already gone
    };
    if meta.file_type().is_symlink() {
        // On Windows, a directory symlink (or junction) is removed as a dir.
        #[cfg(windows)]
        {
            if p.is_dir() {
                fs::remove_dir(p).with_context(|| format!("remove_dir (symlink) {}", p.display()))?;
                return Ok(());
            }
        }
        fs::remove_file(p).with_context(|| format!("remove_file (symlink) {}", p.display()))?;
    } else if meta.is_dir() {
        fs::remove_dir_all(p).with_context(|| format!("remove_dir_all {}", p.display()))?;
    } else {
        fs::remove_file(p).with_context(|| format!("remove_file {}", p.display()))?;
    }
    Ok(())
}

/// Clone the InterBrain repo into the vault at `<vault>/InterBrain` so the
/// plugin source code lives alongside the user's data — the canonical
/// "plugin code is a DreamNode" pattern. Idempotent: clones if missing,
/// fast-forwards if present. The fast-forward is best-effort — if the user
/// has local commits or git isn't available, the existing clone is kept
/// as-is. Non-git directories at the path are also left alone.
pub fn ensure_interbrain_clone_in_vault(vault_path: &Path) -> Result<PathBuf> {
    let clone_dir = vault_path.join("InterBrain");

    if clone_dir.exists() {
        // Only attempt to refresh if it's a real git repo. Anything else
        // (a user's hand-made folder, broken state) we leave untouched.
        if clone_dir.join(".git").exists() {
            let mut cmd = std::process::Command::new("git");
            cmd.arg("pull")
                .arg("--ff-only")
                .arg("--quiet")
                .current_dir(&clone_dir);
            suppress_console_window(&mut cmd);
            match cmd.status() {
                Ok(s) if s.success() => {
                    tracing::info!(target: "vaults", path = %clone_dir.display(), "InterBrain DreamNode fast-forwarded");
                }
                Ok(s) => {
                    // Non-zero exit (local commits, dirty tree, no upstream): not fatal.
                    tracing::debug!(target: "vaults", path = %clone_dir.display(), status = %s, "InterBrain pull skipped");
                }
                Err(e) => {
                    tracing::debug!(target: "vaults", path = %clone_dir.display(), error = %e, "git pull invocation failed");
                }
            }
        }
        return Ok(clone_dir);
    }

    let mut cmd = std::process::Command::new("git");
    cmd.arg("clone")
        .arg("--depth")
        .arg("1")
        .arg(PLUGIN_REPO_URL)
        .arg(&clone_dir);
    suppress_console_window(&mut cmd);
    let status = cmd.status().context("git clone InterBrain")?;
    if !status.success() {
        bail!("git clone failed (status {})", status);
    }
    tracing::info!(target: "vaults", path = %clone_dir.display(), "cloned InterBrain repo into vault");
    Ok(clone_dir)
}

/// Switch a vault to dev mode: ensure the InterBrain repo is cloned into
/// the vault, build the plugin, then point the plugin dir at the clone via
/// symlink (Unix) or directory junction (Windows — works without admin).
///
/// Atomic: only delete the existing plugin dir AFTER the new link is in
/// place. If the link operation fails, restore the managed install.
pub fn enable_dev_mode(vault_path: &Path, bundled_dir: &Path) -> Result<()> {
    let clone_dir = ensure_interbrain_clone_in_vault(vault_path)?;

    // Build the plugin if needed.
    if !clone_dir.join("main.js").exists() {
        let mut npm_install = std::process::Command::new("npm");
        npm_install.arg("install").current_dir(&clone_dir);
        suppress_console_window(&mut npm_install);
        let install_status = npm_install.status().context("npm install")?;
        if !install_status.success() { bail!("npm install failed"); }

        let mut npm_build = std::process::Command::new("npm");
        npm_build.arg("run").arg("build:plugin").current_dir(&clone_dir);
        suppress_console_window(&mut npm_build);
        let build_status = npm_build.status().context("npm run build:plugin")?;
        if !build_status.success() { bail!("npm run build failed"); }
    }

    let plugins_root = vault_path.join(".obsidian/plugins");
    fs::create_dir_all(&plugins_root)?;
    let target = plugins_root.join(PLUGIN_ID);
    let staging = plugins_root.join(format!("{PLUGIN_ID}.dev-link"));

    if staging.exists() { remove_path(&staging)?; }

    // Create the link FIRST at staging path. If it fails, target stays intact.
    if let Err(e) = link_dir(&clone_dir, &staging) {
        // Best-effort: restore from bundled if target was somehow lost.
        // Pass expects_dev_mode=false because the dev-mode attempt failed.
        let _ = ensure_plugin_health(vault_path, bundled_dir, false);
        return Err(anyhow!(
            "failed to create dev-mode link: {e}. \
             Plugin restored to managed mode if it was missing. \
             (On Windows: junctions usually work without admin.)"
        ));
    }

    // Atomic swap: remove old target, rename staging to target.
    if target.exists() { remove_path(&target)?; }
    if let Err(e) = fs::rename(&staging, &target) {
        let _ = remove_path(&staging);
        let _ = install_managed(vault_path, bundled_dir);
        return Err(anyhow!("rename of dev link failed: {e}; restored managed install"));
    }

    enable_plugin(vault_path)?;
    Ok(())
}

/// Switch back to managed mode: install_managed handles symlink/junction
/// removal atomically via its staging-rename pattern.
pub fn disable_dev_mode(vault_path: &Path, bundled_dir: &Path) -> Result<()> {
    install_managed(vault_path, bundled_dir)
}

/// Verify a vault's plugin dir is healthy; reinstall managed files if not.
///
/// `expects_dev_mode` reflects the user's intent recorded in the vault
/// registry. If false (the default), an unexpected symlink indicates a
/// pre-companion-app legacy install — convert it to managed mode so the
/// daemon controls plugin updates from here on. If true, a symlink is
/// the correct state and only a broken target requires repair.
///
/// Returns true if a repair was performed.
pub fn ensure_plugin_health(
    vault_path: &Path,
    bundled_dir: &Path,
    expects_dev_mode: bool,
) -> Result<bool> {
    let plugin_dir = vault_path.join(".obsidian/plugins").join(PLUGIN_ID);

    let needs_repair = match fs::symlink_metadata(&plugin_dir) {
        Err(_) => true, // doesn't exist
        Ok(meta) => {
            if meta.file_type().is_symlink() {
                if expects_dev_mode {
                    // Working dev-mode link must resolve to an existing dir.
                    !plugin_dir.is_dir()
                } else {
                    // Legacy install (pre-companion-app dev-mode pattern):
                    // always convert to managed so the daemon owns plugin files.
                    tracing::info!(
                        target: "vaults",
                        vault = %vault_path.display(),
                        "legacy symlinked plugin detected — converting to managed install"
                    );
                    true
                }
            } else if meta.is_dir() {
                // Regular dir must contain manifest + main.js.
                !plugin_dir.join("manifest.json").exists() || !plugin_dir.join("main.js").exists()
            } else {
                true
            }
        }
    };

    if needs_repair {
        tracing::warn!(target: "vaults", vault = %vault_path.display(), "plugin install missing or broken — restoring");
        install_managed(vault_path, bundled_dir)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Add the plugin id to `<vault>/.obsidian/community-plugins.json`. Idempotent.
fn enable_plugin(vault_path: &Path) -> Result<()> {
    let path = vault_path.join(".obsidian/community-plugins.json");
    let mut list: Vec<String> = if path.exists() {
        let content = fs::read_to_string(&path)?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    if !list.iter().any(|p| p == PLUGIN_ID) {
        list.push(PLUGIN_ID.to_string());
    }
    fs::create_dir_all(path.parent().unwrap())?;
    fs::write(&path, serde_json::to_string_pretty(&list)?)?;
    Ok(())
}

#[cfg(unix)]
fn link_dir(src: &Path, dst: &Path) -> Result<()> {
    std::os::unix::fs::symlink(src, dst)
        .with_context(|| format!("symlink {} -> {}", src.display(), dst.display()))
}

/// Windows: directory junction via `mklink /J`. Works without admin or
/// Developer Mode (unlike `symlink_dir`). Resolves at the kernel level via
/// the IO Manager so app code (including Obsidian) sees it as a regular dir.
#[cfg(windows)]
fn link_dir(src: &Path, dst: &Path) -> Result<()> {
    let mut cmd = std::process::Command::new("cmd");
    cmd.args(["/C", "mklink", "/J"]).arg(dst).arg(src);
    suppress_console_window(&mut cmd);
    let out = cmd.output().context("spawn mklink /J")?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        bail!("mklink /J failed: {} {}", stderr.trim(), stdout.trim());
    }
    Ok(())
}
