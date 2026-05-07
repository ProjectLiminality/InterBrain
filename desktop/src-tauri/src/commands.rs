//! Tauri commands — the surface invoked from the React UI via `invoke()`.

use crate::identity::{DiscoveredIdentity, FreshIdentityResult, IdentityManager};
use crate::settings::{DaemonSettings, RegisteredVault};
use crate::signaling::SignalingClient;
use crate::uuid_index::UuidIndex;
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
    pub event_bus: crate::ipc::EventBus,
    pub uuid_index: Arc<UuidIndex>,
    pub signaling: Arc<SignalingClient>,
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

        // Resolve bundled plugin dir.
        //
        //   Production builds:  ${resource_dir}/plugin/  (set up by
        //     desktop/scripts/copy-plugin-resources.mjs which runs before
        //     `tauri build` and copies the plugin files from the repo root
        //     into desktop/src-tauri/resources/plugin/).
        //
        //   Dev (`tauri dev`):  walk up from CWD to find the repo root
        //     (where manifest.json lives at the top level for Obsidian).
        //
        // If neither exists, log loudly and store the resource dir anyway —
        // install_plugin_into_vault will surface a clear error to the UI.
        let bundled_plugin_dir = {
            let resource_path = handle
                .path()
                .resource_dir()
                .ok()
                .map(|d| d.join("plugin"));
            if let Some(p) = resource_path.as_ref().filter(|p| p.exists()) {
                tracing::info!(target: "commands", path = %p.display(), "bundled plugin: using resource dir");
                p.clone()
            } else {
                // Dev fallback: walk up looking for manifest.json.
                let mut walker = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
                let mut found_dev = None;
                loop {
                    if walker.join("manifest.json").exists() {
                        found_dev = Some(walker.clone());
                        break;
                    }
                    match walker.parent() {
                        Some(p) => walker = p.to_path_buf(),
                        None => break,
                    }
                }
                if let Some(p) = found_dev {
                    tracing::info!(target: "commands", path = %p.display(), "bundled plugin: using dev tree (walk-up)");
                    p
                } else {
                    let candidate = resource_path.unwrap_or_else(|| PathBuf::from("/__plugin_not_bundled__"));
                    tracing::error!(
                        target: "commands",
                        candidate = %candidate.display(),
                        "bundled plugin not found — install will fail until daemon is rebuilt with resources"
                    );
                    candidate
                }
            }
        };

        let uuid_index = Arc::new(UuidIndex::new());
        // Initial scan from registered vaults.
        let vault_paths: Vec<PathBuf> = settings
            .vault_registry
            .iter()
            .map(|v| PathBuf::from(&v.path))
            .collect();
        if let Err(e) = uuid_index.rebuild_from_vaults(&vault_paths) {
            tracing::warn!("[commands] initial uuid index scan: {e}");
        }

        let signaling = Arc::new(SignalingClient::new(
            crate::signaling::DEFAULT_SIGNALING_BASE_URL,
        ));

        Ok(Self {
            identity,
            settings: Mutex::new(settings),
            ipc_port: Mutex::new(None),
            config_dir,
            bundled_plugin_dir,
            event_bus: crate::ipc::EventBus::new(),
            uuid_index,
            signaling,
        })
    }

    /// Re-scan all registered vaults' UUID index. Call after vault add/remove
    /// or significant filesystem change.
    pub fn refresh_uuid_index(&self) {
        let paths: Vec<PathBuf> = self
            .settings
            .lock()
            .unwrap()
            .vault_registry
            .iter()
            .map(|v| PathBuf::from(&v.path))
            .collect();
        if let Err(e) = self.uuid_index.rebuild_from_vaults(&paths) {
            tracing::warn!("[commands] uuid index refresh: {e}");
        }
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
        vaults::enable_dev_mode(&path, &state.bundled_plugin_dir).map_err(|e| e.to_string())?;
    } else {
        vaults::disable_dev_mode(&path, &state.bundled_plugin_dir).map_err(|e| e.to_string())?;
    }
    let mut s = state.settings.lock().unwrap();
    if let Some(v) = s.vault_registry.iter_mut().find(|v| v.path == vault_path) {
        v.dev_mode = enabled;
    }
    drop(s);
    state.save_settings(&handle).map_err(|e| e.to_string())?;
    state.refresh_uuid_index();
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
    crate::request_quit();
    handle.exit(0);
}

#[tauri::command]
pub fn discover_obsidian_vaults() -> Result<Vec<String>, String> {
    vaults::discover_obsidian_vaults().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn default_new_vault_parent() -> String {
    vaults::default_new_vault_parent().to_string_lossy().to_string()
}

#[tauri::command]
pub fn create_vault(parent_dir: String, name: String) -> Result<String, String> {
    let path = vaults::create_vault(Path::new(&parent_dir), &name)
        .map_err(|e| e.to_string())?;
    tracing::info!(target: "vaults", path = %path.display(), "created new vault");
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn detect_existing_identity(state: State<Arc<AppState>>) -> Option<DiscoveredIdentity> {
    state.identity.detect_existing()
}

#[tauri::command]
pub fn generate_fresh_identity(
    state: State<Arc<AppState>>,
    passphrase: Option<String>,
    store_in_keychain: bool,
) -> Result<FreshIdentityResult, String> {
    state
        .identity
        .generate_fresh(passphrase, store_in_keychain)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn probe_keychain() -> Result<(), String> {
    IdentityManager::probe_keychain().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn detect_prerequisites() -> crate::prerequisites::PrerequisiteStatus {
    crate::prerequisites::detect()
}

/// Write a log entry from the frontend to the daemon's structured log.
/// Use sparingly — for events that meaningfully advance state or surface
/// user-facing errors. Routine UI reactions don't need this.
#[tauri::command]
pub fn log_event(level: String, source: String, message: String, fields: Option<serde_json::Value>) {
    let lvl = level.to_lowercase();
    match lvl.as_str() {
        "error" => tracing::error!(target: "frontend", source = %source, fields = ?fields, "{message}"),
        "warn"  => tracing::warn!(target: "frontend", source = %source, fields = ?fields, "{message}"),
        "info"  => tracing::info!(target: "frontend", source = %source, fields = ?fields, "{message}"),
        _       => tracing::debug!(target: "frontend", source = %source, fields = ?fields, "{message}"),
    }
}

/// Reveal the daemon's log directory in the OS file manager so users can
/// attach logs to bug reports.
#[tauri::command]
pub fn reveal_log_dir() -> Result<(), String> {
    let dir = crate::default_log_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.to_string_lossy().to_string();
    #[cfg(target_os = "macos")]
    let cmd = ("open", vec![path.as_str()]);
    #[cfg(target_os = "linux")]
    let cmd = ("xdg-open", vec![path.as_str()]);
    #[cfg(target_os = "windows")]
    let cmd = ("explorer", vec![path.as_str()]);
    std::process::Command::new(cmd.0).args(cmd.1).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn install_prerequisite(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    dependency: String,
    request_id: String,
) -> Result<(), String> {
    let dep = match dependency.as_str() {
        "git" => crate::installer::Dependency::Git,
        "obsidian" => crate::installer::Dependency::Obsidian,
        other => return Err(format!("unknown dependency: {other}")),
    };
    let bus = std::sync::Arc::new(state.event_bus.clone());
    let ctx = crate::installer::InstallContext { bus, app, request_id };
    crate::installer::install(dep, &ctx).await
}

/// Tauri command wrapper around the private `open_url` helper.
#[tauri::command(rename_all = "snake_case")]
pub fn open_external_url(url: String) -> Result<(), String> {
    self::open_url(&url).map_err(|e| e.to_string())
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

    // Install plugin files into .obsidian/plugins/InterBrain
    vaults::install_managed(&path, &state.bundled_plugin_dir).map_err(|e| e.to_string())?;

    // Also clone the InterBrain repo as a DreamNode at <vault>/InterBrain.
    // This is the canonical "plugin code IS a DreamNode" pattern. Best-
    // effort: if git isn't available or the clone fails, the plugin still
    // works, but we surface the failure in the log.
    if let Err(e) = vaults::ensure_interbrain_clone_in_vault(&path) {
        tracing::warn!(
            target: "vaults",
            vault = %path.display(),
            error = %e,
            "InterBrain repo clone into vault failed (plugin still installed)"
        );
    }

    let mut s = state.settings.lock().unwrap();
    if !s.vault_registry.iter().any(|v| v.path == vault_path) {
        s.vault_registry.push(RegisteredVault { path: vault_path, dev_mode: false });
    }
    drop(s);
    state.save_settings(&handle).map_err(|e| e.to_string())?;
    state.refresh_uuid_index();
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
    state
        .event_bus
        .emit("settings-changed", serde_json::json!({ "settings": settings }));
    Ok(settings)
}
