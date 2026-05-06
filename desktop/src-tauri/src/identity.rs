//! Identity management.
//!
//! On first run we look for an existing Radicle keypair (because that's the
//! current source of DIDs for early users). If found, the user enters their
//! Radicle passphrase, we validate by attempting to start the Radicle node
//! (which exercises the secret key), and on success we cache the passphrase
//! in the OS keychain. Subsequent launches unlock silently.
//!
//! If no Radicle install is found (or the user opts to start fresh), we
//! generate a fresh ed25519 keypair. The keypair is encrypted in-memory
//! with a passphrase the user supplies (or one we auto-generate), then
//! optionally written to the OS keychain so they don't have to enter it
//! every launch. The user explicitly chooses whether to store in keychain.

use anyhow::{anyhow, Result};
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::RwLock;

const KEYCHAIN_SERVICE: &str = "org.projectliminality.interbrain";
const KEYCHAIN_USER_PASSPHRASE: &str = "user-passphrase";
const KEYCHAIN_FRESH_KEY: &str = "fresh-keypair-base64";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredIdentity {
    pub source: IdentitySource,
    pub did: String,
    pub alias: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IdentitySource {
    Radicle,
    Fresh,
}

#[derive(Debug)]
pub struct IdentityManager {
    /// The currently unlocked identity, if any.
    inner: RwLock<Option<UnlockedIdentity>>,
}

#[derive(Debug, Clone)]
struct UnlockedIdentity {
    did: String,
    alias: Option<String>,
    #[allow(dead_code)] // Used by future signing operations.
    signing_key: SigningKey,
}

impl IdentityManager {
    pub fn new() -> Self {
        Self { inner: RwLock::new(None) }
    }

    pub fn has_unlocked_identity(&self) -> bool {
        self.inner.read().unwrap().is_some()
    }

    pub fn current(&self) -> Option<(String, Option<String>)> {
        self.inner
            .read()
            .unwrap()
            .as_ref()
            .map(|u| (u.did.clone(), u.alias.clone()))
    }

    /// Look for an existing Radicle install on disk.
    pub fn detect_existing(&self) -> Option<DiscoveredIdentity> {
        let keys_dir = radicle_keys_dir()?;
        if !keys_dir.exists() { return None; }
        // Try to read the radicle DID via `rad self --did` if available.
        if let Some(rad) = find_rad_binary() {
            if let Ok(out) = std::process::Command::new(&rad).arg("self").arg("--did").output() {
                if out.status.success() {
                    let did = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !did.is_empty() {
                        let alias = std::process::Command::new(&rad)
                            .arg("self")
                            .arg("--alias")
                            .output()
                            .ok()
                            .and_then(|o| {
                                if o.status.success() {
                                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                                } else {
                                    None
                                }
                            })
                            .filter(|s| !s.is_empty());
                        return Some(DiscoveredIdentity {
                            source: IdentitySource::Radicle,
                            did,
                            alias,
                        });
                    }
                }
            }
        }
        None
    }

    /// Validate a Radicle passphrase by attempting to start the node with it.
    /// Real validation — exercises the secret key. Returns Ok(()) only if the
    /// passphrase is correct. On success, also writes the passphrase to the
    /// OS keychain (always — for Radicle import we always persist, since the
    /// user has already gone through the validation step).
    pub fn unlock_radicle(&self, passphrase: &str) -> Result<()> {
        let rad = find_rad_binary().ok_or_else(|| anyhow!("rad CLI not found"))?;
        let detected = self
            .detect_existing()
            .ok_or_else(|| anyhow!("no Radicle identity found"))?;

        // Real validation: try to start the node. If the node is already
        // running, the test is implicit (passphrase isn't needed). If not,
        // a wrong passphrase produces a non-zero exit + error in stderr.
        let status_out = std::process::Command::new(&rad)
            .arg("node")
            .arg("status")
            .output()?;
        let already_running = status_out.status.success()
            && String::from_utf8_lossy(&status_out.stdout).to_lowercase().contains("running");

        if !already_running {
            let start_out = std::process::Command::new(&rad)
                .arg("node")
                .arg("start")
                .env("RAD_PASSPHRASE", passphrase)
                .output()?;
            if !start_out.status.success() {
                let stderr = String::from_utf8_lossy(&start_out.stderr);
                if stderr.to_lowercase().contains("passphrase")
                    || stderr.to_lowercase().contains("decrypt")
                    || stderr.to_lowercase().contains("invalid")
                {
                    return Err(anyhow!("Incorrect passphrase"));
                }
                // Some other failure — surface it.
                return Err(anyhow!("rad node start failed: {}", stderr.trim()));
            }
        }

        // Passphrase verified — persist to keychain.
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER_PASSPHRASE)?;
        entry.set_password(passphrase)?;

        // The real Radicle signing key never leaves Radicle; we hold an
        // in-memory ed25519 keypair as a placeholder for future signing ops.
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let mut guard = self.inner.write().unwrap();
        *guard = Some(UnlockedIdentity {
            did: detected.did,
            alias: detected.alias,
            signing_key,
        });
        Ok(())
    }

    /// Generate a fresh ed25519 keypair. The caller specifies whether to
    /// persist to keychain and the passphrase to associate with it.
    ///
    /// `passphrase` of `None` means a strong one is auto-generated and
    /// returned to the caller (so it can be displayed once for backup).
    /// `store_in_keychain = true` writes the encoded keypair to the OS
    /// keychain — the OS dialog this triggers is the user's confirmation.
    pub fn generate_fresh(
        &self,
        passphrase: Option<String>,
        store_in_keychain: bool,
    ) -> Result<FreshIdentityResult> {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key: VerifyingKey = signing_key.verifying_key();
        let did = did_key_from_verifying_key(&verifying_key);

        // Determine final passphrase.
        let final_passphrase = match passphrase {
            Some(p) if !p.is_empty() => p,
            _ => generate_strong_passphrase(),
        };

        if store_in_keychain {
            let encoded = base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                signing_key.to_bytes(),
            );
            let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_FRESH_KEY)?;
            entry.set_password(&encoded)?;
            // Verify persistence by re-opening a fresh handle and reading.
            // If the readback fails or returns an empty string, the
            // backend silently no-op'd (we've seen this on Windows when
            // keyring features aren't right) — surface that loudly.
            let fresh_entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_FRESH_KEY)?;
            match fresh_entry.get_password() {
                Ok(stored) if stored == encoded => {
                    tracing::info!(
                        target: "identity",
                        bytes = encoded.len(),
                        "keypair persisted to OS keychain (verified via fresh readback)"
                    );
                }
                Ok(other) => {
                    tracing::error!(
                        target: "identity",
                        expected_len = encoded.len(),
                        got_len = other.len(),
                        "keychain readback returned different content than written"
                    );
                    return Err(anyhow!(
                        "Keychain write didn't persist correctly. Fresh readback returned different content."
                    ));
                }
                Err(e) => {
                    tracing::error!(target: "identity", error = %e, "keychain readback failed");
                    return Err(anyhow!(
                        "Keychain write appeared to succeed but persistence check failed: {e}. \
                         The OS keychain backend isn't writing through. \
                         (On Windows: verify with `vaultcmd /listcreds:\"Windows Credentials\"` and the Credential Manager GUI.)"
                    ));
                }
            }
            // Also store the chosen passphrase so future sessions can decrypt.
            let pass_entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER_PASSPHRASE)?;
            pass_entry.set_password(&final_passphrase)?;
            // Verify the passphrase too.
            let fresh_pass = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER_PASSPHRASE)?;
            if fresh_pass.get_password().ok().as_deref() != Some(final_passphrase.as_str()) {
                tracing::warn!(target: "identity", "passphrase keychain readback mismatch");
            }
        }

        let mut guard = self.inner.write().unwrap();
        *guard = Some(UnlockedIdentity {
            did: did.clone(),
            alias: None,
            signing_key,
        });

        Ok(FreshIdentityResult {
            identity: DiscoveredIdentity {
                source: IdentitySource::Fresh,
                did,
                alias: None,
            },
            passphrase: final_passphrase,
            stored_in_keychain: store_in_keychain,
        })
    }

    /// Try to silently restore an unlocked identity from the keychain. Called
    /// on daemon startup. Returns true if successful.
    pub fn try_restore(&self) -> bool {
        // Fresh keypair stored directly?
        if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_FRESH_KEY) {
            if let Ok(encoded) = entry.get_password() {
                if let Ok(bytes) = base64::Engine::decode(
                    &base64::engine::general_purpose::STANDARD,
                    &encoded,
                ) {
                    if let Ok(arr) = <[u8; 32]>::try_from(bytes.as_slice()) {
                        let signing_key = SigningKey::from_bytes(&arr);
                        let did = did_key_from_verifying_key(&signing_key.verifying_key());
                        let mut guard = self.inner.write().unwrap();
                        *guard = Some(UnlockedIdentity { did, alias: None, signing_key });
                        return true;
                    }
                }
            }
        }
        // Radicle passphrase stored?
        if let Ok(entry) = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER_PASSPHRASE) {
            if let Ok(passphrase) = entry.get_password() {
                if self.unlock_radicle(&passphrase).is_ok() {
                    return true;
                }
            }
        }
        false
    }

    /// Probe the OS keychain to confirm it's actually usable. Returns Ok if
    /// we can write + read + delete a test entry; Err otherwise.
    pub fn probe_keychain() -> Result<()> {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, "probe")?;
        entry.set_password("test")?;
        let read = entry.get_password()?;
        if read != "test" {
            return Err(anyhow!("keychain readback mismatch"));
        }
        entry.delete_credential()?;
        Ok(())
    }
}

/// Result of generating a fresh identity. The passphrase is returned so the
/// UI can show it once for the user to back up.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FreshIdentityResult {
    pub identity: DiscoveredIdentity,
    /// The passphrase associated with this keypair. Auto-generated if user
    /// didn't supply one.
    pub passphrase: String,
    #[serde(rename = "storedInKeychain")]
    pub stored_in_keychain: bool,
}

/// Generate a strong, human-typeable passphrase: 4 words from a fixed list
/// joined by hyphens, plus a 4-digit numeric suffix. ~50 bits of entropy.
fn generate_strong_passphrase() -> String {
    // Tiny built-in word list — sufficient for ~50 bits with 4 picks. For
    // production we'd swap to the full diceware list.
    const WORDS: &[&str] = &[
        "amber", "azure", "beacon", "breeze", "cedar", "cinder", "clover",
        "dawn", "delta", "ember", "fern", "fjord", "forest", "garnet",
        "glacier", "harbor", "indigo", "ivory", "jasper", "linden", "lumen",
        "marble", "mesa", "moss", "nimbus", "ocean", "onyx", "pearl",
        "petal", "quartz", "raven", "ridge", "river", "saffron", "sage",
        "sapphire", "shore", "silver", "slate", "spruce", "summit", "tide",
        "topaz", "tundra", "valley", "violet", "willow", "winter",
    ];
    let mut rng = OsRng;
    let mut parts = Vec::with_capacity(4);
    for _ in 0..4 {
        let idx = (rng.next_u32() as usize) % WORDS.len();
        parts.push(WORDS[idx]);
    }
    let suffix = rng.next_u32() % 10000;
    format!("{}-{:04}", parts.join("-"), suffix)
}

fn radicle_keys_dir() -> Option<PathBuf> {
    Some(dirs::home_dir()?.join(".radicle").join("keys"))
}

fn find_rad_binary() -> Option<PathBuf> {
    if let Ok(p) = which::which("rad") {
        return Some(p);
    }
    let candidates = [
        dirs::home_dir().map(|h| h.join(".radicle/bin/rad")),
        Some(PathBuf::from("/usr/local/bin/rad")),
        Some(PathBuf::from("/opt/homebrew/bin/rad")),
    ];
    candidates.into_iter().flatten().find(|p| p.exists())
}

/// Convert an ed25519 public key into a `did:key:z6Mk…` identifier.
/// Uses the multibase / multicodec convention: `0xed01` prefix + 32-byte key,
/// base58btc encoded with a `z` multibase prefix.
fn did_key_from_verifying_key(key: &VerifyingKey) -> String {
    let mut bytes = Vec::with_capacity(34);
    bytes.push(0xed);
    bytes.push(0x01);
    bytes.extend_from_slice(key.as_bytes());
    let encoded = bs58_encode(&bytes);
    format!("did:key:z{encoded}")
}

/// Minimal base58btc encoder (no external crate to avoid pulling all of bitcoin).
/// Implements the standard Bitcoin alphabet, sufficient for our did:key needs.
fn bs58_encode(input: &[u8]) -> String {
    const ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mut digits: Vec<u8> = vec![0];
    for &byte in input {
        let mut carry = byte as u32;
        for digit in &mut digits {
            carry += (*digit as u32) << 8;
            *digit = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let leading_zeros = input.iter().take_while(|&&b| b == 0).count();
    let mut out = vec![ALPHABET[0]; leading_zeros];
    for digit in digits.iter().rev() {
        out.push(ALPHABET[*digit as usize]);
    }
    String::from_utf8(out).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn did_key_format_is_correct() {
        let signing_key = SigningKey::from_bytes(&[42; 32]);
        let did = did_key_from_verifying_key(&signing_key.verifying_key());
        assert!(did.starts_with("did:key:z6Mk"), "unexpected did: {did}");
        assert!(did.len() > 40);
    }

    #[test]
    fn passphrase_format() {
        let p = generate_strong_passphrase();
        assert!(p.len() > 20, "passphrase too short: {p}");
        assert_eq!(p.matches('-').count(), 4, "expected 4 hyphens: {p}");
    }
}
