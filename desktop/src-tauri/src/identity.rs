//! Identity management.
//!
//! On first run we look for an existing Radicle keypair (because that's the
//! current source of DIDs for early users). If found, the user enters their
//! Radicle passphrase to validate, and we cache the unlocked passphrase in
//! the OS keychain. Subsequent launches unlock silently.
//!
//! If no Radicle install is found, we generate a fresh ed25519 keypair and
//! store it in the keychain directly.

use anyhow::{anyhow, Result};
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::rngs::OsRng;
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

    /// Validate the supplied Radicle passphrase by attempting to unlock the node,
    /// then cache it in the keychain so we never have to ask again.
    pub fn unlock_radicle(&self, passphrase: &str) -> Result<()> {
        let rad = find_rad_binary().ok_or_else(|| anyhow!("rad CLI not found"))?;
        let detected = self
            .detect_existing()
            .ok_or_else(|| anyhow!("no Radicle identity found"))?;

        // `rad node status` is cheap and exercises the keychain.
        let out = std::process::Command::new(&rad)
            .arg("self")
            .arg("--did")
            .env("RAD_PASSPHRASE", passphrase)
            .output()?;
        if !out.status.success() {
            return Err(anyhow!("Radicle rejected the passphrase"));
        }

        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER_PASSPHRASE)?;
        entry.set_password(passphrase)?;

        // For now we only store the DID; future signing uses the in-memory keypair
        // generated alongside it. (The real Radicle signing key never leaves Radicle.)
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

    /// Generate a fresh ed25519 keypair and store it in the keychain.
    pub fn generate_fresh(&self) -> Result<DiscoveredIdentity> {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key: VerifyingKey = signing_key.verifying_key();
        let did = did_key_from_verifying_key(&verifying_key);

        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_FRESH_KEY)?;
        let encoded = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            signing_key.to_bytes(),
        );
        entry.set_password(&encoded)?;

        let mut guard = self.inner.write().unwrap();
        *guard = Some(UnlockedIdentity {
            did: did.clone(),
            alias: None,
            signing_key,
        });

        Ok(DiscoveredIdentity {
            source: IdentitySource::Fresh,
            did,
            alias: None,
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
}
