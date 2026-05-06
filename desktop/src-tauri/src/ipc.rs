//! IPC server: WebSocket on a localhost port, discovered by the Obsidian plugin
//! via `${TAURI_CONFIG_DIR}/ipc-port`. Random uncommon default port; falls back
//! to next free.

use crate::commands::AppState;
use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

const PREFERRED_PORT: u16 = 51847;
const FALLBACK_RANGE: std::ops::RangeInclusive<u16> = 51848..=51900;

/// Broadcast bus for daemon-initiated events delivered to every connected
/// IPC client (e.g. settings-changed when the dashboard updates settings).
#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<Value>,
}

impl EventBus {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(64);
        Self { tx }
    }

    pub fn emit(&self, name: &str, payload: Value) {
        let frame = json!({ "kind": "event", "name": name, "payload": payload });
        let _ = self.tx.send(frame);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.tx.subscribe()
    }
}

pub async fn run_server(state: Arc<AppState>, app_handle: AppHandle) -> Result<()> {
    let (listener, port) = bind().await?;
    *state.ipc_port.lock().unwrap() = Some(port);
    let port_file = state.config_dir.join("ipc-port");
    if let Err(e) = std::fs::write(&port_file, port.to_string()) {
        tracing::warn!("could not write ipc-port file at {}: {e}", port_file.display());
    }
    tracing::info!("IPC server listening on 127.0.0.1:{port}");

    while let Ok((stream, _addr)) = listener.accept().await {
        let state = state.clone();
        let app_handle = app_handle.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_connection(state, app_handle, stream).await {
                tracing::warn!("connection error: {e}");
            }
        });
    }
    Ok(())
}

async fn bind() -> Result<(TcpListener, u16)> {
    if let Ok(l) = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], PREFERRED_PORT))).await {
        return Ok((l, PREFERRED_PORT));
    }
    for p in FALLBACK_RANGE {
        if let Ok(l) = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], p))).await {
            return Ok((l, p));
        }
    }
    let l = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await?;
    let p = l.local_addr()?.port();
    Ok((l, p))
}

async fn handle_connection(
    state: Arc<AppState>,
    app_handle: AppHandle,
    stream: tokio::net::TcpStream,
) -> Result<()> {
    let ws = accept_async(stream).await?;
    let (mut write, mut read) = ws.split();
    let mut events = state.event_bus.subscribe();
    loop {
        tokio::select! {
            // Inbound IPC request from the plugin.
            msg = read.next() => {
                let Some(msg) = msg else { break; };
                let msg = msg?;
                match msg {
                    Message::Text(text) => {
                        let parsed: Value = match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(e) => {
                                let err = json!({
                                    "kind": "response",
                                    "id": "",
                                    "ok": false,
                                    "error": { "code": "parse_error", "message": e.to_string() }
                                });
                                write.send(Message::Text(err.to_string())).await?;
                                continue;
                            }
                        };
                        let response = dispatch(&state, &app_handle, parsed).await;
                        write.send(Message::Text(response.to_string())).await?;
                    }
                    Message::Close(_) => break,
                    Message::Ping(p) => write.send(Message::Pong(p)).await?,
                    _ => {}
                }
            }
            // Daemon-initiated event broadcast.
            evt = events.recv() => {
                match evt {
                    Ok(frame) => write.send(Message::Text(frame.to_string())).await?,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
    Ok(())
}

async fn dispatch(state: &Arc<AppState>, app_handle: &AppHandle, msg: Value) -> Value {
    let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let op = msg.get("op").and_then(|v| v.as_str()).unwrap_or("");
    match op {
        "hello" => {
            let (did, alias) = state
                .identity
                .current()
                .map(|(d, a)| (Some(d), a))
                .unwrap_or((None, None));
            ok(&id, json!({
                "daemonVersion": env!("CARGO_PKG_VERSION"),
                "protocolVersion": 1,
                "identity": { "did": did, "alias": alias }
            }))
        }
        "get-settings" => {
            let s = state.settings.lock().unwrap().clone();
            ok(&id, json!({ "settings": s }))
        }
        "set-settings" => {
            let payload = msg.get("payload").cloned().unwrap_or(Value::Null);
            let new_settings: Result<crate::settings::DaemonSettings, _> = payload
                .get("settings")
                .cloned()
                .map(serde_json::from_value)
                .unwrap_or_else(|| Err(serde::de::Error::custom("missing settings")));
            match new_settings {
                Ok(next) => {
                    *state.settings.lock().unwrap() = next.clone();
                    if let Err(e) = state.save_settings(app_handle) {
                        return err(&id, "save_failed", &e.to_string());
                    }
                    state.event_bus.emit("settings-changed", json!({ "settings": next }));
                    ok(&id, json!({ "settings": next }))
                }
                Err(e) => err(&id, "invalid_settings", &e.to_string()),
            }
        }
        // Used by git-remote-interbrain to find a UUID locally before
        // attempting peer transport.
        "resolve-uuid" => {
            let payload = msg.get("payload").cloned().unwrap_or(Value::Null);
            let uuid = payload.get("uuid").and_then(|v| v.as_str()).unwrap_or("");
            if uuid.is_empty() {
                return err(&id, "bad_request", "uuid required");
            }
            let vaults: Vec<std::path::PathBuf> = state
                .settings
                .lock()
                .unwrap()
                .vault_registry
                .iter()
                .map(|v| std::path::PathBuf::from(&v.path))
                .collect();
            let preferred = state.uuid_index.resolve_preferred(uuid, &vaults);
            let all = state.uuid_index.resolve(uuid);
            ok(&id, json!({
                "preferred": preferred.map(|p| p.to_string_lossy().to_string()),
                "all": all.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
            }))
        }

        // Force a re-scan of the UUID index. Plugin can call after creating
        // a new DreamNode so the helper sees it on the next resolution.
        "refresh-uuid-index" => {
            state.refresh_uuid_index();
            ok(&id, json!({}))
        }

        // Transport ops — webrtc handshake + git pack-protocol pump. Only
        // the helper binary calls these; they hold the connection open for
        // the duration of the git operation.
        "clone" | "share" | "fetch-updates" => err(
            &id,
            "not_implemented",
            "Use git-remote-interbrain helper to invoke transport.",
        ),
        other => err(&id, "unknown_op", &format!("Unknown op: {other}")),
    }
}

fn ok(id: &str, payload: Value) -> Value {
    json!({ "kind": "response", "id": id, "ok": true, "payload": payload })
}

fn err(id: &str, code: &str, message: &str) -> Value {
    json!({
        "kind": "response",
        "id": id,
        "ok": false,
        "error": { "code": code, "message": message }
    })
}
