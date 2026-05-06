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

const PLUGIN_ID: &str = "interbrain";
const PLUGIN_REPO_URL: &str = "https://github.com/ProjectLiminality/InterBrain.git";

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
pub fn install_managed(vault_path: &Path, bundled_dir: &Path) -> Result<()> {
    let target = vault_path.join(".obsidian/plugins").join(PLUGIN_ID);
    if target.exists() {
        if fs::symlink_metadata(&target)?.file_type().is_symlink() {
            fs::remove_file(&target)?;
        } else {
            fs::remove_dir_all(&target)?;
        }
    }
    fs::create_dir_all(&target)?;
    for file in ["manifest.json", "main.js", "styles.css"] {
        let src = bundled_dir.join(file);
        if !src.exists() {
            bail!("bundled plugin missing: {}", src.display());
        }
        fs::copy(&src, target.join(file))?;
    }
    enable_plugin(vault_path)?;
    Ok(())
}

/// Switch a vault to dev mode: clone InterBrain into the vault if needed,
/// then symlink the plugin directory to the clone.
pub fn enable_dev_mode(vault_path: &Path) -> Result<()> {
    let clone_dir = vault_path.join("InterBrain");
    if !clone_dir.exists() {
        let status = std::process::Command::new("git")
            .arg("clone")
            .arg(PLUGIN_REPO_URL)
            .arg(&clone_dir)
            .status()
            .context("git clone InterBrain")?;
        if !status.success() {
            bail!("git clone failed");
        }
        let install_status = std::process::Command::new("npm")
            .arg("install")
            .current_dir(&clone_dir)
            .status()
            .context("npm install")?;
        if !install_status.success() { bail!("npm install failed"); }
        let build_status = std::process::Command::new("npm")
            .arg("run")
            .arg("build:plugin")
            .current_dir(&clone_dir)
            .status()
            .context("npm run build:plugin")?;
        if !build_status.success() { bail!("npm run build failed"); }
    }
    let plugin_dir = vault_path.join(".obsidian/plugins").join(PLUGIN_ID);
    let plugins_parent = plugin_dir
        .parent()
        .ok_or_else(|| anyhow!("plugin dir has no parent"))?;
    fs::create_dir_all(plugins_parent)?;
    if plugin_dir.exists() {
        let meta = fs::symlink_metadata(&plugin_dir)?;
        if meta.file_type().is_symlink() {
            fs::remove_file(&plugin_dir)?;
        } else {
            fs::remove_dir_all(&plugin_dir)?;
        }
    }
    symlink_dir(&clone_dir, &plugin_dir)?;
    enable_plugin(vault_path)?;
    Ok(())
}

/// Switch a vault back to managed mode: remove symlink, copy bundled files in.
pub fn disable_dev_mode(vault_path: &Path, bundled_dir: &Path) -> Result<()> {
    install_managed(vault_path, bundled_dir)
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
fn symlink_dir(src: &Path, dst: &Path) -> Result<()> {
    std::os::unix::fs::symlink(src, dst).context("symlink")
}

#[cfg(windows)]
fn symlink_dir(src: &Path, dst: &Path) -> Result<()> {
    std::os::windows::fs::symlink_dir(src, dst).context("symlink_dir")
}
