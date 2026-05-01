//! Tauri commands — the surface invoked from the React UI via `invoke()`.

use crate::identity::{DiscoveredIdentity, IdentityManager};
use crate::settings::{DaemonSettings, RegisteredVault};
use crate::vaults::{self, VaultEntry};
use crate::windows;
use anyhow::Context;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_store::StoreExt;

const SETTINGS_FILENAME: &str = "settings.json";

pub struct AppState {
    pub identity: IdentityManager,
    pub settings: Mutex<DaemonSettings>,
    pub ipc_port: Mutex<Option<u16>>,
    pub config_dir: PathBuf,
    pub bundled_plugin_dir: PathBuf,
}

impl AppState {
    pub fn new<R: Runtime>(handle: AppHandle<R>) -> anyhow::Result<Self> {
        let config_dir = handle
            .path()
            .app_config_dir()
            .context("app_config_dir")?;
        std::fs::create_dir_all(&config_dir).ok();

        let identity = IdentityManager::new();
        identity.try_restore();

        // Settings load.
        let store = handle.store(SETTINGS_FILENAME).context("open settings store")?;
        let settings: DaemonSettings = store
            .get("settings")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();

        // Resolve bundled plugin dir. When running `tauri dev`, the resource
        // dir points at the dev tree; we look for the built plugin at the
        // repo root. In production, files are bundled under `resources/`.
        let bundled_plugin_dir = handle
            .path()
            .resource_dir()
            .ok()
            .map(|d| d.join("plugin"))
            .filter(|p| p.exists())
            .unwrap_or_else(|| {
                // Dev fallback: navigate up from desktop/src-tauri to repo root.
                let mut p = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
                while p.parent().is_some() && !p.join("manifest.json").exists() {
                    p = p.parent().unwrap().to_path_buf();
                }
                p
            });

        Ok(Self {
            identity,
            settings: Mutex::new(settings),
            ipc_port: Mutex::new(None),
            config_dir,
            bundled_plugin_dir,
        })
    }

    pub fn save_settings(&self, handle: &AppHandle) -> anyhow::Result<()> {
        let store = handle.store(SETTINGS_FILENAME)?;
        let s = self.settings.lock().unwrap().clone();
        store.set("settings", serde_json::to_value(&s)?);
        store.save()?;
        Ok(())
    }
}

#[derive(Debug, Serialize)]
pub struct DaemonStatus {
    pub online: bool,
    pub did: Option<String>,
    pub alias: Option<String>,
}

#[tauri::command]
pub fn list_vaults(state: State<Arc<AppState>>) -> Result<Vec<VaultEntry>, String> {
    let registry = state.settings.lock().unwrap().vault_registry.clone();
    let mut entries = Vec::new();
    for v in registry {
        if let Ok(entry) = vaults::inspect_vault(Path::new(&v.path)) {
            entries.push(entry);
        }
    }
    Ok(entries)
}

#[tauri::command]
pub fn get_status(state: State<Arc<AppState>>) -> DaemonStatus {
    let (did, alias) = state
        .identity
        .current()
        .map(|(d, a)| (Some(d), a))
        .unwrap_or((None, None));
    DaemonStatus { online: true, did, alias }
}

#[tauri::command]
pub fn open_vault_in_obsidian(vault_path: String) -> Result<(), String> {
    let url = format!("obsidian://open?path={}", urlencoding::encode(&vault_path));
    open_url(&url).map_err(|e| e.to_string())
}

fn open_url(url: &str) -> anyhow::Result<()> {
    #[cfg(target_os = "macos")]
    let cmd = ("open", vec![url]);
    #[cfg(target_os = "linux")]
    let cmd = ("xdg-open", vec![url]);
    #[cfg(target_os = "windows")]
    let cmd = ("cmd", vec!["/C", "start", "", url]);
    let status = std::process::Command::new(cmd.0).args(cmd.1).status()?;
    if !status.success() {
        anyhow::bail!("open failed");
    }
    Ok(())
}

#[tauri::command]
pub fn set_dev_mode(
    handle: AppHandle,
    state: State<Arc<AppState>>,
    vault_path: String,
    enabled: bool,
) -> Result<(), String> {
    let path = PathBuf::from(&vault_path);
    if enabled {
        vaults::enable_dev_mode(&path).map_err(|e| e.to_string())?;
    } else {
        vaults::disable_dev_mode(&path, &state.bundled_plugin_dir).map_err(|e| e.to_string())?;
    }
    let mut s = state.settings.lock().unwrap();
    if let Some(v) = s.vault_registry.iter_mut().find(|v| v.path == vault_path) {
        v.dev_mode = enabled;
    }
    drop(s);
    state.save_settings(&handle).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_coding_agent(state: State<Arc<AppState>>, repo_path: String) -> Result<(), String> {
    let cmd_string = state.settings.lock().unwrap().coding_agent_command.clone();
    open_terminal_with(&repo_path, &cmd_string).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn open_terminal_with(path: &str, command: &str) -> anyhow::Result<()> {
    let escaped_path = path.replace('"', "\\\"");
    let escaped_cmd = command.replace('"', "\\\"");
    let script = format!(
        r#"tell application "Terminal" to do script "cd \"{escaped_path}\" && {escaped_cmd}""#,
    );
    std::process::Command::new("osascript").arg("-e").arg(&script).status()?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn open_terminal_with(path: &str, command: &str) -> anyhow::Result<()> {
    // Try common terminals in order.
    for term in ["gnome-terminal", "konsole", "xterm"] {
        if which::which(term).is_ok() {
            let arg = format!("cd '{path}' && {command}; exec bash");
            std::process::Command::new(term)
                .arg("--")
                .arg("bash")
                .arg("-c")
                .arg(&arg)
                .spawn()?;
            return Ok(());
        }
    }
    anyhow::bail!("no terminal emulator found")
}

#[cfg(target_os = "windows")]
fn open_terminal_with(path: &str, command: &str) -> anyhow::Result<()> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "cmd", "/K"])
        .arg(format!("cd /D \"{path}\" && {command}"))
        .spawn()?;
    Ok(())
}

#[tauri::command]
pub fn open_first_run_window(handle: AppHandle) -> Result<(), String> {
    windows::open_first_run(&handle).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn close_first_run(handle: AppHandle) -> Result<(), String> {
    windows::close_first_run(&handle).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app(handle: AppHandle) {
    handle.exit(0);
}

#[tauri::command]
pub fn discover_obsidian_vaults() -> Result<Vec<String>, String> {
    vaults::discover_obsidian_vaults().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn detect_existing_identity(state: State<Arc<AppState>>) -> Option<DiscoveredIdentity> {
    state.identity.detect_existing()
}

#[tauri::command]
pub fn generate_fresh_identity(
    state: State<Arc<AppState>>,
) -> Result<DiscoveredIdentity, String> {
    state.identity.generate_fresh().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unlock_existing_identity(
    state: State<Arc<AppState>>,
    passphrase: String,
) -> Result<(), String> {
    state.identity.unlock_radicle(&passphrase).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn install_plugin_into_vault(
    handle: AppHandle,
    state: State<Arc<AppState>>,
    vault_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(&vault_path);
    vaults::install_managed(&path, &state.bundled_plugin_dir).map_err(|e| e.to_string())?;
    let mut s = state.settings.lock().unwrap();
    if !s.vault_registry.iter().any(|v| v.path == vault_path) {
        s.vault_registry.push(RegisteredVault { path: vault_path, dev_mode: false });
    }
    drop(s);
    state.save_settings(&handle).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: State<Arc<AppState>>) -> DaemonSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_settings(
    handle: AppHandle,
    state: State<Arc<AppState>>,
    settings: DaemonSettings,
) -> Result<DaemonSettings, String> {
    *state.settings.lock().unwrap() = settings.clone();
    state.save_settings(&handle).map_err(|e| e.to_string())?;
    Ok(settings)
}
