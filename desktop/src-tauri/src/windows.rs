//! Window management — tray popover and first-run window.

use anyhow::Result;
use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

const TRAY_WINDOW_LABEL: &str = "tray";
const FIRST_RUN_WINDOW_LABEL: &str = "first-run";

const TRAY_W: f64 = 380.0;
const TRAY_H: f64 = 620.0;
const FIRST_RUN_W: f64 = 560.0;
const FIRST_RUN_H: f64 = 540.0;

/// Toggle the tray popover, anchored directly under the tray icon at the
/// given screen-space (physical pixel) coordinates. `anchor_x` should be the
/// horizontal center of the icon; `anchor_y` should be just below the icon.
pub fn toggle_tray_window_at(app: &AppHandle, anchor_x: f64, anchor_y: f64) -> Result<()> {
    let monitor_scale = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    // Anchor coords come in physical pixels; convert to logical for window APIs.
    let logical_x = anchor_x / monitor_scale;
    let logical_y = anchor_y / monitor_scale;
    // Center the popover horizontally on the icon, with a small gap below.
    let pos_x = (logical_x - TRAY_W / 2.0).max(8.0);
    let pos_y = logical_y + 4.0;

    if let Some(win) = app.get_webview_window(TRAY_WINDOW_LABEL) {
        let _ = win.set_position(LogicalPosition::new(pos_x, pos_y));
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
    .position(pos_x, pos_y)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(true)
    .build()?;
    let _ = win.set_focus();
    Ok(())
}

/// Open without anchor info (e.g., from menu item or initial launch). Uses
/// the existing position if the window already exists; otherwise centers on
/// the primary monitor's top edge as a sensible default.
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
    // First-time open without anchor — fall through to a sensible default.
    let monitor = app.primary_monitor().ok().flatten();
    let (mx, my) = monitor
        .map(|m| {
            let size = m.size();
            let scale = m.scale_factor();
            ((size.width as f64 / scale - TRAY_W) / 2.0, 32.0)
        })
        .unwrap_or((100.0, 32.0));
    let win = WebviewWindowBuilder::new(
        app,
        TRAY_WINDOW_LABEL,
        WebviewUrl::App("index.html#tray".into()),
    )
    .title("InterBrain")
    .inner_size(TRAY_W, TRAY_H)
    .position(mx, my)
    .resizable(false)
    .decorations(false)
    .transparent(true)
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
