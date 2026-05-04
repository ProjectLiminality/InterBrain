//! InterBrain desktop daemon.
//!
//! The daemon runs in the system tray and owns:
//!   - Identity (DID + keypair, stored in OS keychain)
//!   - Vault registry + plugin file management (managed vs dev mode)
//!   - WebSocket IPC server for the Obsidian plugin
//!   - WebRTC transport (planned: webrtc-rs)
//!   - System-level settings (API keys, coding agent, etc.)

mod commands;
mod identity;
mod ipc;
mod prerequisites;
mod settings;
mod signaling;
mod transport;
mod uuid_index;
mod vaults;
mod windows;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    Manager,
};

/// Set to true when the user has explicitly chosen Quit. Until then, we
/// suppress exit events so closing a window doesn't terminate the daemon.
static QUIT_REQUESTED: AtomicBool = AtomicBool::new(false);

pub fn request_quit() {
    QUIT_REQUESTED.store(true, Ordering::SeqCst);
}

pub fn is_quit_requested() -> bool {
    QUIT_REQUESTED.load(Ordering::SeqCst)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
        // Single-instance lock — if a second daemon launches (e.g., user starts
        // it while one is already running), this callback fires in the existing
        // instance and the second one exits immediately. Prevents duplicate
        // tray icons.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tracing::info!("[single-instance] second launch attempted; bringing existing window forward");
            if let Err(e) = windows::toggle_tray_window(app) {
                tracing::warn!("[single-instance] toggle window: {e}");
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::list_vaults,
            commands::get_status,
            commands::open_vault_in_obsidian,
            commands::set_dev_mode,
            commands::open_coding_agent,
            commands::open_first_run_window,
            commands::quit_app,
            commands::discover_obsidian_vaults,
            commands::detect_existing_identity,
            commands::generate_fresh_identity,
            commands::probe_keychain,
            commands::detect_prerequisites,
            commands::open_external_url,
            commands::unlock_existing_identity,
            commands::install_plugin_into_vault,
            commands::close_first_run,
            commands::get_settings,
            commands::set_settings,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize state.
            let state = std::sync::Arc::new(commands::AppState::new(handle.clone())?);
            app.manage(state.clone());

            // Build the system tray.
            let menu = Menu::with_items(
                app.handle(),
                &[
                    &MenuItem::with_id(app.handle(), "open", "Open InterBrain", true, None::<&str>)?,
                    &MenuItem::with_id(app.handle(), "quit", "Quit", true, None::<&str>)?,
                ],
            )?;

            let tray_icon_bytes = include_bytes!("../icons/tray-template.png");
            let _tray = tauri::tray::TrayIconBuilder::with_id("main")
                .icon(Image::from_bytes(tray_icon_bytes)?)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        // `rect.position` and `rect.size` are Position/Size
                        // enums (Physical/Logical variants); convert to a
                        // physical pixel pair for the window anchor.
                        let pos = rect.position.to_physical::<f64>(1.0);
                        let size = rect.size.to_physical::<f64>(1.0);
                        let anchor_x = pos.x + size.width / 2.0;
                        let anchor_y = pos.y + size.height;
                        if let Err(e) = windows::toggle_tray_window_at(app, anchor_x, anchor_y) {
                            tracing::error!("toggle_tray_window_at: {e}");
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => { let _ = windows::toggle_tray_window(app); }
                    "quit" => { request_quit(); app.exit(0); }
                    _ => {}
                })
                .build(app)?;

            // Start the IPC server in the background.
            let state_for_ipc = state.clone();
            let handle_for_ipc = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ipc::run_server(state_for_ipc, handle_for_ipc).await {
                    tracing::error!("ipc server crashed: {e}");
                }
            });

            // Open first-run window if no identity exists yet.
            if !state.identity.has_unlocked_identity() {
                windows::open_first_run(app.handle())?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                // Keep running in tray when a window closes — but honor explicit
                // quits (Quit button, Cmd+Q, tray menu Quit).
                if !is_quit_requested() {
                    api.prevent_exit();
                }
            }
        });
}
