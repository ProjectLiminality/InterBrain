//! Window management — tray popover and first-run window.

use anyhow::Result;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const TRAY_WINDOW_LABEL: &str = "tray";
const FIRST_RUN_WINDOW_LABEL: &str = "first-run";

const TRAY_W: f64 = 360.0;
const TRAY_H: f64 = 460.0;
const FIRST_RUN_W: f64 = 560.0;
const FIRST_RUN_H: f64 = 540.0;

pub fn toggle_tray_window(app: &AppHandle) -> Result<()> {
    if let Some(win) = app.get_webview_window(TRAY_WINDOW_LABEL) {
        if win.is_visible().unwrap_or(false) {
            win.hide()?;
        } else {
            win.show()?;
            win.set_focus()?;
        }
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(
        app,
        TRAY_WINDOW_LABEL,
        WebviewUrl::App("index.html#tray".into()),
    )
    .title("InterBrain")
    .inner_size(TRAY_W, TRAY_H)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(true)
    .build()?;
    let _ = win.set_focus();
    Ok(())
}

pub fn open_first_run(app: &AppHandle) -> Result<()> {
    if let Some(win) = app.get_webview_window(FIRST_RUN_WINDOW_LABEL) {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(
        app,
        FIRST_RUN_WINDOW_LABEL,
        WebviewUrl::App("index.html#first-run".into()),
    )
    .title("Welcome to InterBrain")
    .inner_size(FIRST_RUN_W, FIRST_RUN_H)
    .resizable(false)
    .center()
    .visible(true)
    .build()?;
    let _ = win.set_focus();
    Ok(())
}

pub fn close_first_run(app: &AppHandle) -> Result<()> {
    if let Some(win) = app.get_webview_window(FIRST_RUN_WINDOW_LABEL) {
        win.close()?;
    }
    Ok(())
}
