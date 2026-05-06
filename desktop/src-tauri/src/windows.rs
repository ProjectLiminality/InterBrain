//! Window management — tray popover and first-run window.

use anyhow::Result;
use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

const TRAY_WINDOW_LABEL: &str = "tray";
const FIRST_RUN_WINDOW_LABEL: &str = "first-run";

const TRAY_W: f64 = 380.0;
const TRAY_H: f64 = 620.0;
const FIRST_RUN_W: f64 = 560.0;
const FIRST_RUN_H: f64 = 540.0;

/// Toggle the tray popover, anchored to the tray icon. We compute a
/// platform-appropriate position:
///   - macOS: tray sits in the menu bar at the top of the primary display, so
///     the popover hangs below the icon (standard menu-bar app pattern).
///   - Windows: the system tray ("notification area") sits at the bottom-right,
///     so the popover should anchor *above* the icon (anchor_y = top of icon)
///     and right-align to the icon. This matches the Windows 11 fly-out
///     behavior used by Calendar, Wi-Fi, etc.
///   - Linux: depends on panel position; we default to "below the anchor"
///     and rely on clamping to keep the window on-screen.
///
/// In all cases we clamp the resulting rect into the monitor's working area
/// so the popover is never partially off-screen.
pub fn toggle_tray_window_at(app: &AppHandle, anchor_x: f64, anchor_y: f64) -> Result<()> {
    let (pos_x, pos_y) = compute_tray_position(app, anchor_x, anchor_y);

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
    let mut builder = WebviewWindowBuilder::new(
        app,
        TRAY_WINDOW_LABEL,
        WebviewUrl::App("index.html#tray".into()),
    )
    .title("InterBrain")
    .inner_size(TRAY_W, TRAY_H)
    .position(pos_x, pos_y)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(true);
    // Transparent window only on macOS — on Windows, WebView2 rejects
    // transparency (HRESULT 0x80070578) and the daemon crashes.
    #[cfg(target_os = "macos")]
    {
        builder = builder.transparent(true);
    }
    let win = builder.build()?;
    let _ = win.set_focus();
    Ok(())
}

/// Compute a logical-pixel (x, y) position for the tray popover such that
/// it anchors next to the system tray icon and stays fully on-screen.
fn compute_tray_position(app: &AppHandle, anchor_x_phys: f64, anchor_y_phys: f64) -> (f64, f64) {
    let monitor = app.primary_monitor().ok().flatten();
    let scale = monitor.as_ref().map(|m| m.scale_factor()).unwrap_or(1.0);
    let monitor_size = monitor.as_ref().map(|m| {
        let s = m.size();
        (s.width as f64 / scale, s.height as f64 / scale)
    }).unwrap_or((1920.0, 1080.0));

    let logical_x = anchor_x_phys / scale;
    let logical_y = anchor_y_phys / scale;

    // Determine whether the tray icon is in the upper or lower half of the
    // screen. Top → menu-bar style (popover hangs below); bottom → notification-
    // area style (popover floats above).
    let is_bottom_tray = logical_y > monitor_size.1 / 2.0;

    let mut pos_x = logical_x - TRAY_W / 2.0;
    let mut pos_y = if is_bottom_tray {
        // Anchor BELOW would go off the bottom edge — float above instead,
        // with a small gap.
        logical_y - TRAY_H - 8.0
    } else {
        logical_y + 4.0
    };

    // Clamp horizontally: keep at least 8px from each edge.
    let max_x = monitor_size.0 - TRAY_W - 8.0;
    if pos_x < 8.0 { pos_x = 8.0; }
    if pos_x > max_x { pos_x = max_x.max(8.0); }

    // Clamp vertically: same.
    let max_y = monitor_size.1 - TRAY_H - 8.0;
    if pos_y < 8.0 { pos_y = 8.0; }
    if pos_y > max_y { pos_y = max_y.max(8.0); }

    (pos_x, pos_y)
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
    let mut builder = WebviewWindowBuilder::new(
        app,
        TRAY_WINDOW_LABEL,
        WebviewUrl::App("index.html#tray".into()),
    )
    .title("InterBrain")
    .inner_size(TRAY_W, TRAY_H)
    .position(mx, my)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(true);
    #[cfg(target_os = "macos")]
    {
        builder = builder.transparent(true);
    }
    let win = builder.build()?;
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
