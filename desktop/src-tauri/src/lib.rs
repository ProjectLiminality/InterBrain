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
mod settings;
mod vaults;
mod windows;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    tauri::Builder::default()
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
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Err(e) = windows::toggle_tray_window(app) {
                            tracing::error!("toggle_tray_window: {e}");
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => { let _ = windows::toggle_tray_window(app); }
                    "quit" => { app.exit(0); }
                    _ => {}
                })
                .build(app)?;

            // Start the IPC server in the background.
            let state_for_ipc = state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = ipc::run_server(state_for_ipc).await {
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
                // Keep running in tray when last window closes; only exit on explicit quit.
                api.prevent_exit();
            }
        });
}
