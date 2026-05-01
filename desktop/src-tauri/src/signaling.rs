//! Cloudflare Worker signaling client.
//!
//! Two peers each derive the same `room_id = sha256(sort(didA, didB))` and
//! drop signed signaling blobs (SDP offer/answer + ICE candidates) into the
//! Worker's per-room mailbox. Cloudflare never sees git data; once the
//! WebRTC handshake completes, all bytes flow peer-to-peer directly.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const DEFAULT_SIGNALING_BASE_URL: &str =
    "https://interbrain-signaling-dev.liminalconsulting.workers.dev";

/// Compute the deterministic room id for a peer pair. Both sides compute it
/// from the same inputs, so neither has to coordinate the room name.
pub fn room_id_for(a: &str, b: &str) -> String {
    let (lo, hi) = if a < b { (a, b) } else { (b, a) };
    let mut hasher = Sha256::new();
    hasher.update(lo.as_bytes());
    hasher.update(b" ");
    hasher.update(hi.as_bytes());
    hex::encode(hasher.finalize())
}

#[derive(Debug, Serialize)]
struct PostBlobBody<'a> {
    from: &'a str,
    data: &'a str,
    sig: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "expiresAt")]
    expires_at: Option<u64>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SignalingBlob {
    pub seq: u64,
    pub from: String,
    #[serde(rename = "receivedAt")]
    pub received_at: u64,
    #[serde(rename = "expiresAt")]
    pub expires_at: u64,
    pub data: String,
    #[allow(dead_code)]
    pub sig: String,
}

#[derive(Debug, Deserialize)]
struct ListBlobsResponse {
    blobs: Vec<SignalingBlob>,
}

pub struct SignalingClient {
    base_url: String,
    client: reqwest::Client,
}

impl SignalingClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: reqwest::Client::builder()
                .user_agent(concat!("interbrain-daemon/", env!("CARGO_PKG_VERSION")))
                .build()
                .expect("reqwest client"),
        }
    }

    /// Drop a signed blob into the room's mailbox. `data` is whatever the
    /// receiver expects to verify against `sig` — typically the JSON-encoded
    /// SDP/ICE payload.
    pub async fn post_blob(
        &self,
        room: &str,
        from_did: &str,
        data: &str,
        sig: &str,
    ) -> Result<u64> {
        let url = format!("{}/room/{}/blob", self.base_url, room);
        let body = PostBlobBody { from: from_did, data, sig, expires_at: None };
        let resp = self.client.post(&url).json(&body).send().await
            .with_context(|| format!("POST {url}"))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!("signaling post {status}: {text}");
        }
        let parsed: serde_json::Value = serde_json::from_str(&text)
            .with_context(|| format!("parse blob response: {text}"))?;
        Ok(parsed.get("seq").and_then(|v| v.as_u64()).unwrap_or(0))
    }

    /// One-shot fetch of all currently buffered blobs in a room.
    pub async fn list_blobs(&self, room: &str) -> Result<Vec<SignalingBlob>> {
        let url = format!("{}/room/{}/blobs", self.base_url, room);
        let resp = self.client.get(&url).send().await
            .with_context(|| format!("GET {url}"))?;
        if !resp.status().is_success() {
            anyhow::bail!("signaling list {}", resp.status());
        }
        let parsed: ListBlobsResponse = resp.json().await?;
        Ok(parsed.blobs)
    }

    /// Delete blobs up to and including the given seq number — call after
    /// the receiving peer has read and applied them.
    pub async fn clear_blobs(&self, room: &str, up_to_seq: u64) -> Result<()> {
        let url = format!("{}/room/{}/clear", self.base_url, room);
        let body = serde_json::json!({ "upToSeq": up_to_seq });
        let resp = self.client.post(&url).json(&body).send().await
            .with_context(|| format!("POST {url}"))?;
        if !resp.status().is_success() {
            anyhow::bail!("signaling clear {}", resp.status());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn room_id_is_symmetric() {
        let a = "did:key:zAlice";
        let b = "did:key:zBob";
        assert_eq!(room_id_for(a, b), room_id_for(b, a));
        assert_eq!(room_id_for(a, b).len(), 64);
    }
}
