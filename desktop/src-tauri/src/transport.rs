//! WebRTC peer transport.
//!
//! Daemon-side connection management. Each connection to another peer is a
//! single `RTCPeerConnection`; data channels are opened per-operation (one
//! per git pack-protocol session). Cloudflare-hosted signaling is used for
//! the initial SDP/ICE exchange; bytes thereafter flow direct peer-to-peer.

use crate::signaling::{room_id_for, SignalingClient};
use anyhow::{anyhow, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, Mutex};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::setting_engine::SettingEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_candidate::RTCIceCandidate;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::interceptor::registry::Registry;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;

/// Public STUN servers used for NAT discovery. Direct connections work for
/// ~70% of peer pairs without TURN; the remaining 30% would need a TURN
/// relay (Cloudflare Realtime, deferred).
pub fn default_ice_servers() -> Vec<RTCIceServer> {
    vec![
        RTCIceServer { urls: vec!["stun:stun.l.google.com:19302".to_owned()], ..Default::default() },
        RTCIceServer { urls: vec!["stun:stun.cloudflare.com:3478".to_owned()], ..Default::default() },
    ]
}

/// One signaling envelope wraps either an SDP description or a single ICE
/// candidate. We send each in a separate signed blob to the room.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum SignalEnvelope {
    Offer { sdp: String },
    Answer { sdp: String },
    Ice { candidate: String },
}

pub struct PeerSession {
    pub pc: Arc<RTCPeerConnection>,
}

impl PeerSession {
    /// Open an outbound peer connection. We are the offerer.
    ///
    /// `signaling` is the live HTTP client to the Worker. `our_did` and
    /// `peer_did` derive the room id. Returns once the data channel labeled
    /// `git` is open (or an error if signaling/handshake times out).
    pub async fn open_outbound(
        signaling: Arc<SignalingClient>,
        our_did: &str,
        peer_did: &str,
        timeout: Duration,
    ) -> Result<(Self, Arc<RTCDataChannel>, mpsc::Receiver<Vec<u8>>)> {
        let room = room_id_for(our_did, peer_did);
        tracing::info!("[transport] opening outbound to {peer_did} in room {room}");

        let pc = build_peer_connection().await?;

        // Open the data channel BEFORE creating the offer — the offer must
        // include the data-channel section.
        let dc = pc
            .create_data_channel("git", None)
            .await
            .map_err(|e| anyhow!("create_data_channel: {e}"))?;

        // Install on_message NOW (before the data channel opens) so we don't
        // race against the peer's first send. Bytes get pushed into in_rx,
        // which the caller drains.
        let in_rx = install_message_handler(&dc);

        // Wire ICE candidates into the signaling room.
        attach_ice_handler(pc.clone(), signaling.clone(), room.clone(), our_did.to_string());

        // Create the offer and send it.
        let offer = pc
            .create_offer(None)
            .await
            .map_err(|e| anyhow!("create_offer: {e}"))?;
        pc.set_local_description(offer.clone())
            .await
            .map_err(|e| anyhow!("set_local_description: {e}"))?;

        let envelope = SignalEnvelope::Offer { sdp: offer.sdp.clone() };
        post_signal(&signaling, &room, our_did, &envelope).await?;

        // Wait for the answer + remote ICE.
        let dc_open = data_channel_open_future(dc.clone());
        let signaling_pump = pump_remote_signals(
            signaling.clone(),
            pc.clone(),
            room.clone(),
            our_did.to_string(),
            /* expecting_offer = */ false,
        );

        tokio::select! {
            res = dc_open => {
                res?;
                // Stop pumping signals — we're connected.
                Ok((Self { pc }, dc, in_rx))
            }
            res = signaling_pump => {
                // Pump exited unexpectedly; if dc isn't open by now, that's an error.
                res?;
                anyhow::bail!("signaling pump exited before data channel opened");
            }
            _ = tokio::time::sleep(timeout) => {
                anyhow::bail!("outbound handshake timed out after {:?}", timeout);
            }
        }
    }

    /// Accept an inbound peer connection. We are the answerer.
    ///
    /// Polls the signaling room for an offer from `peer_did`, then completes
    /// the handshake and waits for the labeled data channel to open.
    #[allow(dead_code)]
    pub async fn accept_inbound(
        signaling: Arc<SignalingClient>,
        our_did: &str,
        peer_did: &str,
        timeout: Duration,
    ) -> Result<(Self, Arc<RTCDataChannel>, mpsc::Receiver<Vec<u8>>)> {
        let room = room_id_for(our_did, peer_did);
        tracing::info!("[transport] accepting inbound from {peer_did} in room {room}");

        let pc = build_peer_connection().await?;

        // Capture the inbound data channel AND install on_message synchronously
        // before its OnOpen fires — otherwise the peer's first send (the JSON
        // serve-request frame) can be lost in the gap between OnOpen and
        // on_message-install.
        let (dc_tx, mut dc_rx) = mpsc::channel::<(Arc<RTCDataChannel>, mpsc::Receiver<Vec<u8>>)>(1);
        let dc_tx = Arc::new(Mutex::new(Some(dc_tx)));
        pc.on_data_channel(Box::new(move |dc| {
            let dc_tx = dc_tx.clone();
            Box::pin(async move {
                let in_rx = install_message_handler(&dc);
                if let Some(tx) = dc_tx.lock().await.take() {
                    let _ = tx.send((dc, in_rx)).await;
                }
            })
        }));

        attach_ice_handler(pc.clone(), signaling.clone(), room.clone(), our_did.to_string());

        let signaling_pump = pump_remote_signals(
            signaling.clone(),
            pc.clone(),
            room.clone(),
            our_did.to_string(),
            /* expecting_offer = */ true,
        );

        tokio::select! {
            res = signaling_pump => res?,
            entry = dc_rx.recv() => {
                let (dc, in_rx) = entry.ok_or_else(|| anyhow!("data channel sender dropped"))?;
                data_channel_open_future(dc.clone()).await?;
                return Ok((Self { pc }, dc, in_rx));
            }
            _ = tokio::time::sleep(timeout) => {
                anyhow::bail!("inbound handshake timed out after {:?}", timeout);
            }
        }
        anyhow::bail!("inbound completed without data channel");
    }

    pub async fn close(self) {
        let _ = self.pc.close().await;
    }
}

async fn build_peer_connection() -> Result<Arc<RTCPeerConnection>> {
    let mut media = MediaEngine::default();
    media.register_default_codecs().map_err(|e| anyhow!("register codecs: {e}"))?;
    let mut interceptors = Registry::new();
    interceptors = register_default_interceptors(interceptors, &mut media)
        .map_err(|e| anyhow!("interceptors: {e}"))?;

    // Disable mDNS host-candidate obfuscation. webrtc-rs defaults to wrapping
    // local IPs as `*.local` mDNS hostnames for browser-style privacy. Native
    // peers without an mDNS responder can't resolve them, so ICE falls back
    // to srflx (STUN-discovered public IPs). On consumer routers without
    // hairpin NAT, srflx-only fails for peers on the same LAN. Disabling
    // mDNS lets ICE use real local IPs as host candidates, which connect
    // directly when both peers are on the same network.
    let mut settings = SettingEngine::default();
    settings.set_ice_multicast_dns_mode(webrtc::ice::mdns::MulticastDnsMode::Disabled);

    let api = APIBuilder::new()
        .with_media_engine(media)
        .with_interceptor_registry(interceptors)
        .with_setting_engine(settings)
        .build();
    let config = RTCConfiguration {
        ice_servers: default_ice_servers(),
        ..Default::default()
    };
    let pc = api
        .new_peer_connection(config)
        .await
        .map_err(|e| anyhow!("new_peer_connection: {e}"))?;
    Ok(Arc::new(pc))
}

fn attach_ice_handler(
    pc: Arc<RTCPeerConnection>,
    signaling: Arc<SignalingClient>,
    room: String,
    our_did: String,
) {
    pc.on_ice_candidate(Box::new(move |cand: Option<RTCIceCandidate>| {
        let signaling = signaling.clone();
        let room = room.clone();
        let our_did = our_did.clone();
        Box::pin(async move {
            if let Some(c) = cand {
                if let Ok(json) = c.to_json() {
                    let env = SignalEnvelope::Ice { candidate: json.candidate };
                    if let Err(e) = post_signal(&signaling, &room, &our_did, &env).await {
                        tracing::warn!("[transport] ICE post failed: {e}");
                    }
                }
            }
        })
    }));
}

/// Background loop: poll the signaling room and apply remote envelopes to
/// the peer connection. Returns when the handshake completes (data channel
/// open) — caller should drop the future via tokio::select on data-channel-open.
async fn pump_remote_signals(
    signaling: Arc<SignalingClient>,
    pc: Arc<RTCPeerConnection>,
    room: String,
    our_did: String,
    expecting_offer: bool,
) -> Result<()> {
    let mut last_seq: u64 = 0;
    // Both peers start without a remote description. The offerer waits for an
    // Answer; the answerer waits for an Offer. Once received, ICE candidates
    // can be applied. (Earlier this was initialized to `!expecting_offer`,
    // which made the offerer skip Alice's Answer and never set the remote
    // description — ICE then fired with no candidate pairs.)
    let mut got_remote_description = false;
    // Buffer ICE candidates that arrive before the remote description is set
    // (race: Alice posts answer + ICE in quick succession; Bob's pump may see
    // ICE in the same poll as the answer). Apply them as soon as remote desc
    // lands.
    let mut buffered_ice: Vec<String> = Vec::new();
    // The signaling Worker keeps blobs for 7 days. Old blobs from prior
    // sessions are not harmful but they fail to apply (`add_ice failed:
    // remote description is not set`) and clutter logs. Filter to blobs
    // posted within the last ~60s relative to the most recent blob in the
    // room — this aligns both peers on a "current session" without needing
    // a session id in the protocol.
    let session_window_secs: u64 = 60;
    loop {
        let blobs = signaling.list_blobs(&room).await?;
        let max_received_at = blobs.iter().map(|b| b.received_at).max().unwrap_or(0);
        let cutoff = max_received_at.saturating_sub(session_window_secs * 1000);
        let new_blobs: Vec<_> = blobs
            .into_iter()
            .filter(|b| b.seq > last_seq && b.from != our_did && b.received_at >= cutoff)
            .collect();
        for blob in &new_blobs {
            last_seq = blob.seq.max(last_seq);
            let env: SignalEnvelope = match decode_envelope(&blob.data) {
                Ok(e) => e,
                Err(_) => continue,
            };
            match env {
                SignalEnvelope::Offer { sdp } if expecting_offer && !got_remote_description => {
                    let desc = RTCSessionDescription::offer(sdp)
                        .map_err(|e| anyhow!("parse offer: {e}"))?;
                    pc.set_remote_description(desc).await
                        .map_err(|e| anyhow!("set_remote(offer): {e}"))?;
                    got_remote_description = true;
                    let answer = pc.create_answer(None).await
                        .map_err(|e| anyhow!("create_answer: {e}"))?;
                    pc.set_local_description(answer.clone()).await
                        .map_err(|e| anyhow!("set_local(answer): {e}"))?;
                    let env = SignalEnvelope::Answer { sdp: answer.sdp };
                    post_signal(&signaling, &room, &our_did, &env).await?;
                    flush_buffered_ice(&pc, &mut buffered_ice).await;
                }
                SignalEnvelope::Answer { sdp } if !expecting_offer && !got_remote_description => {
                    let desc = RTCSessionDescription::answer(sdp)
                        .map_err(|e| anyhow!("parse answer: {e}"))?;
                    pc.set_remote_description(desc).await
                        .map_err(|e| anyhow!("set_remote(answer): {e}"))?;
                    got_remote_description = true;
                    flush_buffered_ice(&pc, &mut buffered_ice).await;
                }
                SignalEnvelope::Ice { candidate } => {
                    if got_remote_description {
                        let init = webrtc::ice_transport::ice_candidate::RTCIceCandidateInit {
                            candidate,
                            ..Default::default()
                        };
                        if let Err(e) = pc.add_ice_candidate(init).await {
                            tracing::warn!("[transport] add_ice failed: {e}");
                        }
                    } else {
                        // Buffer until remote description lands.
                        buffered_ice.push(candidate);
                    }
                }
                _ => {}
            }
        }
        // NOTE: we intentionally do NOT call clear_blobs here. Both peers
        // share the same room; each peer only processes blobs from the OTHER
        // peer, so naively clearing up to last_seq would delete blobs the
        // local peer posted that the remote peer hasn't yet read. Stale
        // blobs are pruned by the Worker's 7-day TTL.
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

/// Install an on_message handler on a data channel that pushes received
/// bytes into a tokio mpsc channel. Returns the receiver. Must be called
/// before the data channel opens to avoid losing the peer's first send.
fn install_message_handler(dc: &Arc<RTCDataChannel>) -> mpsc::Receiver<Vec<u8>> {
    let (tx, rx) = mpsc::channel::<Vec<u8>>(64);
    dc.on_message(Box::new(move |msg: DataChannelMessage| {
        let tx = tx.clone();
        Box::pin(async move {
            let _ = tx.send(msg.data.to_vec()).await;
        })
    }));
    rx
}

/// Drain a buffer of pending ICE candidates into the peer connection. Called
/// once the remote description lands. Failures are logged but not fatal —
/// individual bad candidates shouldn't abort the handshake.
async fn flush_buffered_ice(pc: &Arc<RTCPeerConnection>, buf: &mut Vec<String>) {
    for candidate in buf.drain(..) {
        let init = webrtc::ice_transport::ice_candidate::RTCIceCandidateInit {
            candidate,
            ..Default::default()
        };
        if let Err(e) = pc.add_ice_candidate(init).await {
            tracing::warn!("[transport] buffered add_ice failed: {e}");
        }
    }
}

/// Wait for a data channel's `OnOpen` callback to fire. Returns when ready
/// or errors if the channel closes before opening.
fn data_channel_open_future(dc: Arc<RTCDataChannel>) -> impl std::future::Future<Output = Result<()>> {
    async move {
        let (tx, mut rx) = mpsc::channel::<Result<()>>(1);
        let tx_open = Arc::new(Mutex::new(Some(tx.clone())));
        let tx_close = Arc::new(Mutex::new(Some(tx.clone())));
        dc.on_open(Box::new(move || {
            let tx = tx_open.clone();
            Box::pin(async move {
                if let Some(tx) = tx.lock().await.take() {
                    let _ = tx.send(Ok(())).await;
                }
            })
        }));
        dc.on_close(Box::new(move || {
            let tx = tx_close.clone();
            Box::pin(async move {
                if let Some(tx) = tx.lock().await.take() {
                    let _ = tx.send(Err(anyhow!("data channel closed before open"))).await;
                }
            })
        }));
        rx.recv().await.unwrap_or_else(|| Err(anyhow!("data channel sender dropped")))
    }
}

async fn post_signal(
    signaling: &SignalingClient,
    room: &str,
    our_did: &str,
    env: &SignalEnvelope,
) -> Result<()> {
    let data = serde_json::to_string(env)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&data);
    // Signature placeholder — real signing arrives when ed25519 identity is plumbed.
    let sig = "unsigned";
    signaling.post_blob(room, our_did, &encoded, sig).await?;
    Ok(())
}

fn decode_envelope(data: &str) -> Result<SignalEnvelope> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data)?;
    let env: SignalEnvelope = serde_json::from_slice(&bytes)?;
    Ok(env)
}

/// Pump bytes between an opened data channel and an arbitrary
/// AsyncRead/AsyncWrite stream. Used by the git helper to relay pack-protocol
/// bytes between git's stdin/stdout and a remote peer's data channel.
pub async fn pump_data_channel<R, W>(
    dc: Arc<RTCDataChannel>,
    mut reader: R,
    mut writer: W,
) -> Result<()>
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
    W: tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    // Inbound: data channel → writer
    let (in_tx, mut in_rx) = mpsc::channel::<Vec<u8>>(64);
    dc.on_message(Box::new(move |msg: DataChannelMessage| {
        let in_tx = in_tx.clone();
        Box::pin(async move {
            let _ = in_tx.send(msg.data.to_vec()).await;
        })
    }));

    let writer_task = tokio::spawn(async move {
        while let Some(buf) = in_rx.recv().await {
            if buf.is_empty() { break; }
            if writer.write_all(&buf).await.is_err() { break; }
        }
        let _ = writer.shutdown().await;
    });

    // Outbound: reader → data channel
    let dc_for_send = dc.clone();
    let reader_task = tokio::spawn(async move {
        let mut buf = vec![0u8; 16 * 1024];
        loop {
            let n = match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            if dc_for_send.send(&bytes::Bytes::copy_from_slice(&buf[..n])).await.is_err() {
                break;
            }
        }
        // Signal EOF by sending an empty payload — the remote interprets this
        // as "writer closed."
        let _ = dc_for_send.send(&bytes::Bytes::new()).await;
    });

    let _ = tokio::join!(writer_task, reader_task);
    Ok(())
}
