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
