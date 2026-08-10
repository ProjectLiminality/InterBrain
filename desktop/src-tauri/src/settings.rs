//! Daemon-owned settings.
//!
//! Persisted via `tauri-plugin-store` to the OS-standard config directory.
//! Settings here are system-level (API keys, agent commands, model choices);
//! GUI/behavior settings stay in the Obsidian plugin.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonSettings {
    #[serde(rename = "codingAgentCommand")]
    pub coding_agent_command: String,
    #[serde(rename = "defaultAIProvider")]
    pub default_ai_provider: String,
    #[serde(rename = "apiKeys")]
    pub api_keys: ApiKeys,
    #[serde(rename = "ollamaEndpoint")]
    pub ollama_endpoint: String,
    #[serde(rename = "whisperModel")]
    pub whisper_model: String,
    #[serde(rename = "whisperLanguage")]
    pub whisper_language: String,
    #[serde(rename = "vaultRegistry", default)]
    pub vault_registry: Vec<RegisteredVault>,
    /// Peers we follow — a derived cache refreshed by activity scans (and
    /// writable via IPC). Per-repo git remotes are the source of truth for
    /// who collaborates on what; this is never authoritative.
    #[serde(rename = "peerRegistry", default)]
    pub peer_registry: Vec<RegisteredPeer>,
    /// Minutes between background activity scans (inbox/outbox feed).
    /// 0 disables scheduled scans; manual Refresh still works.
    #[serde(rename = "activityScanIntervalMinutes", default = "default_activity_scan_interval")]
    pub activity_scan_interval_minutes: u32,
}

fn default_activity_scan_interval() -> u32 {
    45
}

/// A friend / peer we collaborate with. `github_username` is the canonical
/// identity. `name` is a human-readable label (defaults to the username).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredPeer {
    /// GitHub username (e.g. "alice"). Canonical identifier.
    #[serde(rename = "githubUsername", alias = "did", default)]
    pub github_username: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ApiKeys {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claude: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub openai: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub groq: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub xai: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredVault {
    pub path: String,
    #[serde(rename = "devMode", default)]
    pub dev_mode: bool,
}

impl Default for DaemonSettings {
    fn default() -> Self {
        Self {
            coding_agent_command: "claude --continue --allow-dangerously-skip-permissions || claude --allow-dangerously-skip-permissions".to_string(),
            default_ai_provider: "claude".to_string(),
            api_keys: ApiKeys::default(),
            ollama_endpoint: "http://localhost:11434".to_string(),
            whisper_model: "base.en".to_string(),
            whisper_language: "en".to_string(),
            vault_registry: Vec::new(),
            peer_registry: Vec::new(),
            activity_scan_interval_minutes: default_activity_scan_interval(),
        }
    }
}
