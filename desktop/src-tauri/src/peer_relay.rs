//! WebRTC ↔ TCP relay for git pack-protocol bytes.
//!
//! When the helper (`git-remote-interbrain`) needs to talk to a peer's git
//! service, it doesn't speak WebRTC directly — that lives in the daemon.
//! Instead the helper asks the daemon for a relay: a localhost TCP port
//! whose bytes are bridged to a freshly-opened WebRTC data channel with the
//! peer. From the helper's perspective it's just a regular TCP socket; from
//! git's perspective the helper's stdio is bridged to it via two simple pumps.
//!
//! There are two flows:
//!
//! **Outbound** (we are the offerer, asking a peer to serve a repo):
//!   1. Helper calls `open-peer-relay` IPC op with peer DID + service + UUID.
//!   2. Daemon opens `PeerSession::open_outbound`, sends a control frame to
//!      the peer ("please run `git-upload-pack` against UUID X"), then bridges
//!      bytes between a localhost TCP port and the data channel.
//!   3. Daemon returns the port to the helper.
//!   4. Helper connects, exchanges pack-protocol bytes through it.
//!
//! **Inbound** (we are the answerer, serving our repo to a peer):
//!   1. A background loop continuously polls the signaling Worker for any
//!      offer addressed to us by a known peer.
//!   2. When one arrives, complete the handshake; read the first JSON
//!      control frame from the data channel; use it to spawn the requested
//!      git service (`git-upload-pack` or `git-receive-pack`) against the
//!      locally-resolved UUID; bridge service stdio ↔ data channel.
//!
//! This module is the seam where transport.rs (handshake/data-channel) meets
//! commands.rs (UUID resolution + IPC dispatch).
//!
//! The control protocol is line-delimited JSON on the data channel before any
//! pack-protocol bytes flow:
//!   - Offerer sends:   `{"op":"serve","service":"git-upload-pack","uuid":"<u>"}\n`
//!   - Answerer replies: `{"ok":true}\n`  on success, then pack-protocol bytes
//!     flow in both directions until either side closes.
//!   - On failure:      `{"ok":false,"error":"<msg>"}\n` then close.

use anyhow::{anyhow, bail, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Command as TokioCommand;
use tokio::sync::mpsc;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::RTCDataChannel;

use crate::commands::AppState;
use crate::signaling::SignalingClient;
use crate::transport::PeerSession;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Serialize, Deserialize)]
struct ServeRequest {
    op: String, // "serve"
    service: String, // "git-upload-pack" | "git-receive-pack"
    uuid: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct ServeReply {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Open an outbound relay to a peer. Returns the localhost port the helper
/// should connect to. The relay task runs until the TCP socket or data
/// channel closes.
pub async fn open_outbound_relay(
    state: Arc<AppState>,
    peer_did: String,
    service: String,
    uuid: String,
) -> Result<u16> {
    if service != "git-upload-pack" && service != "git-receive-pack" {
        bail!("unsupported service: {service}");
    }
    let our_did = state
        .identity
        .current()
        .map(|(d, _)| d)
        .ok_or_else(|| anyhow!("no unlocked identity"))?;

    tracing::info!(
        target: "peer_relay",
        peer_did = %peer_did,
        service = %service,
        uuid = %uuid,
        "opening outbound relay"
    );

    let signaling = state.signaling.clone();
    let (session, dc, in_rx) = PeerSession::open_outbound(
        signaling,
        &our_did,
        &peer_did,
        HANDSHAKE_TIMEOUT,
    )
    .await?;

    // Send the serve-request control frame.
    let req = ServeRequest {
        op: "serve".into(),
        service: service.clone(),
        uuid: uuid.clone(),
    };
    let req_line = format!("{}\n", serde_json::to_string(&req)?);
    dc.send(&bytes::Bytes::copy_from_slice(req_line.as_bytes()))
        .await
        .map_err(|e| anyhow!("send serve request: {e}"))?;

    // Bind a localhost TCP port for the helper to connect to.
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();

    let dc_for_relay = dc.clone();
    tokio::spawn(async move {
        // Accept exactly one helper connection on this port.
        match tokio::time::timeout(Duration::from_secs(30), listener.accept()).await {
            Ok(Ok((tcp, _))) => {
                let _ = bridge_data_channel_with_tcp(dc_for_relay, in_rx, tcp, true).await;
            }
            Ok(Err(e)) => tracing::warn!(target: "peer_relay", "tcp accept failed: {e}"),
            Err(_) => tracing::warn!(target: "peer_relay", "helper never connected to relay port"),
        }
        let _ = session.close().await;
    });

    Ok(port)
}

/// Bridge a WebRTC data channel against a TCP socket.
///
/// `expect_reply` — if true, we read one JSON line off the data channel
/// first to confirm the peer accepted our serve request before piping bytes.
async fn bridge_data_channel_with_tcp(
    dc: Arc<RTCDataChannel>,
    mut in_rx: mpsc::Receiver<Vec<u8>>,
    tcp: TcpStream,
    expect_reply: bool,
) -> Result<()> {
    // Inbound stream is already wired by the caller (so on_message could be
    // installed before the data channel opened).
    let (mut tcp_read, mut tcp_write) = tcp.into_split();

    // If the offerer needs to validate the answerer's reply, peel the first
    // JSON line off the inbound stream before we start piping.
    if expect_reply {
        let mut buf: Vec<u8> = Vec::new();
        loop {
            match in_rx.recv().await {
                Some(chunk) if chunk.is_empty() => bail!("peer closed before reply"),
                Some(chunk) => {
                    buf.extend_from_slice(&chunk);
                    if let Some(idx) = buf.iter().position(|&b| b == b'\n') {
                        let line = &buf[..idx];
                        let reply: ServeReply = serde_json::from_slice(line)
                            .map_err(|e| anyhow!("parse reply: {e}"))?;
                        if !reply.ok {
                            bail!("peer rejected: {}", reply.error.unwrap_or_default());
                        }
                        // Anything after the newline is the start of the
                        // pack-protocol stream — flush to TCP immediately.
                        let leftover = &buf[idx + 1..];
                        if !leftover.is_empty() {
                            tcp_write.write_all(leftover).await?;
                        }
                        break;
                    }
                }
                None => bail!("data channel closed without reply"),
            }
        }
    }

    // Pump 1: data channel -> TCP write
    let writer_task = tokio::spawn(async move {
        while let Some(buf) = in_rx.recv().await {
            if buf.is_empty() {
                break; // EOF signal from peer
            }
            if tcp_write.write_all(&buf).await.is_err() {
                break;
            }
        }
        let _ = tcp_write.shutdown().await;
    });

    // Pump 2: TCP read -> data channel
    let dc_for_send = dc.clone();
    let reader_task = tokio::spawn(async move {
        let mut buf = vec![0u8; 16 * 1024];
        loop {
            let n = match tcp_read.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            if dc_for_send
                .send(&bytes::Bytes::copy_from_slice(&buf[..n]))
                .await
                .is_err()
            {
                break;
            }
        }
        // EOF marker.
        let _ = dc_for_send.send(&bytes::Bytes::new()).await;
    });

    let _ = tokio::join!(writer_task, reader_task);
    Ok(())
}

/// Background loop: continuously listen for inbound peer offers and serve
/// requested git operations against locally-resolved UUIDs.
///
/// We poll the signaling Worker for offers from each known peer DID. When
/// an offer arrives we accept the connection, read the serve-request control
/// frame from the data channel, resolve the UUID locally, spawn the git
/// service, and bridge service stdio ↔ data channel.
pub async fn run_inbound_listener(state: Arc<AppState>) {
    // Wait until we have an identity unlocked — no point listening if we
    // can't compute room IDs.
    loop {
        if state.identity.current().is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
    let our_did = match state.identity.current() {
        Some((d, _)) => d,
        None => return,
    };
    tracing::info!(
        target: "peer_relay",
        did = %our_did,
        "inbound listener started"
    );

    // Per-peer state: which offer-seq we've already accepted (success or
    // failure). Keyed by peer DID, value = highest seq we've attempted.
    // Once we accept seq N, we never accept the same N again — only fresh
    // offers at seq > N. This prevents re-running accept against a stale
    // offer that's still in the signaling room.
    let attempted: Arc<tokio::sync::Mutex<std::collections::HashMap<String, u64>>> =
        Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));

    loop {
        let peers = known_peer_dids(&state);
        for peer_did in peers {
            let Some((offer_seq, _)) = latest_offer_from_peer(&state.signaling, &our_did, &peer_did).await
            else {
                continue;
            };
            // Skip if we've already attempted this offer (by seq).
            {
                let map = attempted.lock().await;
                if let Some(&prev) = map.get(&peer_did) {
                    if offer_seq <= prev {
                        continue;
                    }
                }
            }
            attempted.lock().await.insert(peer_did.clone(), offer_seq);
            let state_clone = state.clone();
            let our_did_clone = our_did.clone();
            let peer_did_clone = peer_did.clone();
            tokio::spawn(async move {
                let result = accept_one(state_clone, our_did_clone, peer_did_clone.clone()).await;
                if let Err(e) = result {
                    tracing::warn!(
                        target: "peer_relay",
                        peer_did = %peer_did_clone,
                        error = %e,
                        "inbound accept failed"
                    );
                }
            });
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

/// Peers we'll accept inbound connections from. Reads the persisted peer
/// registry — populated via the friend-link flow or `add-peer` IPC op.
fn known_peer_dids(state: &Arc<AppState>) -> Vec<String> {
    state
        .settings
        .lock()
        .unwrap()
        .peer_registry
        .iter()
        .map(|p| p.did.clone())
        .collect()
}

/// Find the most recent offer blob from `peer_did` in the room. Returns
/// (seq, received_at_ms) if one exists within the session window, else None.
/// "Most recent" by received_at — there may be multiple offers from
/// multiple session attempts; we always take the freshest.
async fn latest_offer_from_peer(
    signaling: &SignalingClient,
    our_did: &str,
    peer_did: &str,
) -> Option<(u64, u64)> {
    let room = crate::signaling::room_id_for(our_did, peer_did);
    let blobs = signaling.list_blobs(&room).await.ok()?;
    if blobs.is_empty() {
        return None;
    }
    let max_received_at = blobs.iter().map(|b| b.received_at).max().unwrap_or(0);
    let cutoff = max_received_at.saturating_sub(60_000); // 60s window in ms

    use base64::Engine;
    blobs
        .into_iter()
        .filter(|b| b.from == peer_did && b.received_at >= cutoff)
        .filter(|b| {
            base64::engine::general_purpose::STANDARD
                .decode(&b.data)
                .ok()
                .and_then(|bytes| std::str::from_utf8(&bytes).ok().map(|s| s.contains("\"kind\":\"offer\"")))
                .unwrap_or(false)
        })
        .max_by_key(|b| b.received_at)
        .map(|b| (b.seq, b.received_at))
}

/// Accept one inbound connection from `peer_did` and serve the requested
/// git operation. Returns when the data channel closes.
async fn accept_one(state: Arc<AppState>, our_did: String, peer_did: String) -> Result<()> {
    let signaling = state.signaling.clone();
    let (session, dc, mut req_rx) = PeerSession::accept_inbound(
        signaling,
        &our_did,
        &peer_did,
        HANDSHAKE_TIMEOUT,
    )
    .await?;
    // on_message is already installed inside accept_inbound (so we don't lose
    // the peer's first send). We just consume from req_rx.

    let mut buf: Vec<u8> = Vec::new();
    let req: ServeRequest = loop {
        match tokio::time::timeout(Duration::from_secs(10), req_rx.recv()).await {
            Ok(Some(chunk)) if chunk.is_empty() => bail!("peer closed before serve request"),
            Ok(Some(chunk)) => {
                buf.extend_from_slice(&chunk);
                if let Some(idx) = buf.iter().position(|&b| b == b'\n') {
                    let line = &buf[..idx];
                    let parsed: ServeRequest = serde_json::from_slice(line)
                        .map_err(|e| anyhow!("parse serve request: {e}"))?;
                    let _leftover = buf.split_off(idx + 1);
                    // Leftover bytes are the start of the pack stream — we
                    // need to forward them to the spawned service. Stash:
                    buf = _leftover;
                    break parsed;
                }
            }
            Ok(None) => bail!("data channel closed before serve request"),
            Err(_) => bail!("serve request timeout"),
        }
    };

    // Resolve UUID locally.
    let local_path = resolve_local_uuid(&state, &req.uuid);
    let local_path = match local_path {
        Some(p) => p,
        None => {
            send_reply(&dc, ServeReply { ok: false, error: Some(format!("uuid not found: {}", req.uuid)) }).await?;
            session.close().await;
            return Ok(());
        }
    };

    if req.service != "git-upload-pack" && req.service != "git-receive-pack" {
        send_reply(&dc, ServeReply { ok: false, error: Some(format!("unsupported service: {}", req.service)) }).await?;
        session.close().await;
        return Ok(());
    }

    // Spawn the git service.
    let mut child = TokioCommand::new(&req.service)
        .arg(&local_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| anyhow!("spawn {}: {}", req.service, e))?;
    let mut child_stdin = child.stdin.take().ok_or_else(|| anyhow!("child has no stdin"))?;
    let mut child_stdout = child.stdout.take().ok_or_else(|| anyhow!("child has no stdout"))?;

    // Send acceptance reply; if there were leftover bytes after the newline,
    // forward them as the start of the inbound stream to the child's stdin.
    send_reply(&dc, ServeReply { ok: true, error: None }).await?;
    if !buf.is_empty() {
        child_stdin.write_all(&buf).await?;
    }

    // Pump 1: data channel -> child stdin
    let writer_task = tokio::spawn(async move {
        while let Some(chunk) = req_rx.recv().await {
            if chunk.is_empty() { break; }
            if child_stdin.write_all(&chunk).await.is_err() { break; }
        }
        let _ = child_stdin.shutdown().await;
    });

    // Pump 2: child stdout -> data channel
    let dc_for_send = dc.clone();
    let reader_task = tokio::spawn(async move {
        let mut buf = vec![0u8; 16 * 1024];
        loop {
            let n = match child_stdout.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            if dc_for_send.send(&bytes::Bytes::copy_from_slice(&buf[..n])).await.is_err() {
                break;
            }
        }
        let _ = dc_for_send.send(&bytes::Bytes::new()).await;
    });

    let _ = tokio::join!(writer_task, reader_task);
    let _ = child.wait().await;
    session.close().await;
    Ok(())
}

async fn send_reply(dc: &Arc<RTCDataChannel>, reply: ServeReply) -> Result<()> {
    let line = format!("{}\n", serde_json::to_string(&reply)?);
    dc.send(&bytes::Bytes::copy_from_slice(line.as_bytes()))
        .await
        .map_err(|e| anyhow!("send reply: {e}"))?;
    Ok(())
}

fn resolve_local_uuid(state: &Arc<AppState>, uuid: &str) -> Option<PathBuf> {
    let vaults: Vec<PathBuf> = state
        .settings
        .lock()
        .unwrap()
        .vault_registry
        .iter()
        .map(|v| PathBuf::from(&v.path))
        .collect();
    state.uuid_index.resolve_preferred(uuid, &vaults)
}

