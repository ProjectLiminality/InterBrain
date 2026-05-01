//! IPC server: WebSocket on a localhost port, discovered by the Obsidian plugin
//! via `${TAURI_CONFIG_DIR}/ipc-port`. Random uncommon default port; falls back
//! to next free.

use crate::commands::AppState;
use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

const PREFERRED_PORT: u16 = 51847;
const FALLBACK_RANGE: std::ops::RangeInclusive<u16> = 51848..=51900;

pub async fn run_server(state: Arc<AppState>) -> Result<()> {
    let (listener, port) = bind().await?;
    *state.ipc_port.lock().unwrap() = Some(port);
    let port_file = state.config_dir.join("ipc-port");
    if let Err(e) = std::fs::write(&port_file, port.to_string()) {
        tracing::warn!("could not write ipc-port file at {}: {e}", port_file.display());
    }
    tracing::info!("IPC server listening on 127.0.0.1:{port}");

    while let Ok((stream, _addr)) = listener.accept().await {
        let state = state.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_connection(state, stream).await {
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
    stream: tokio::net::TcpStream,
) -> Result<()> {
    let ws = accept_async(stream).await?;
    let (mut write, mut read) = ws.split();
    while let Some(msg) = read.next().await {
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
                let response = dispatch(&state, parsed).await;
                write.send(Message::Text(response.to_string())).await?;
            }
            Message::Close(_) => break,
            Message::Ping(p) => write.send(Message::Pong(p)).await?,
            _ => {}
        }
    }
    Ok(())
}

async fn dispatch(state: &Arc<AppState>, msg: Value) -> Value {
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
        // Stubs — these light up once the WebRTC layer is wired.
        "clone" | "share" | "fetch-updates" => err(
            &id,
            "not_implemented",
            "Transport layer not yet implemented in this build.",
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
