//! Activity scanning: the data layer behind the dashboard's Activity tab
//! (issue #393 — "Activity feed: inbox + outbox").
//!
//! The dashboard is a pure OVERVIEW + navigation shortcut: rows carry no
//! actions. Clicking a row deep-links into Obsidian (obsidian://
//! interbrain-activity) where the node is selected and the appropriate
//! modal opens — Check-for-Updates for incoming, Share-Changes for
//! unshared. All acting happens in the plugin, which owns the full flows
//! (cherry-pick, outbox creation via gh, error surfacing).
//!
//! Inbox: ONE aggregated entry per DreamNode — the total number of new
//! peer commits across ALL peer remotes (Alice 1 + Bob 1 → "2 commits").
//! Peer remotes are any non-origin remote: native GitHub URLs are the
//! GitHub-transport canon; legacy interbrain:// URLs are still accepted.
//!
//! Outbox: DreamNodes whose local `main` is ahead of `origin` —
//! committed-but-unpushed work. Uncommitted edits are not feed material.
//!
//! Scans run on a periodic schedule (see `run_scheduler`) and on demand.
//! Results are cached in `AppState.activity`. Peer usernames encountered
//! during a scan are upserted into the daemon's `peer_registry` — a
//! derived cache, never authoritative; per-repo git remotes remain the
//! source of truth for who collaborates on what.

use crate::commands::AppState;
use crate::vaults::suppress_console_window;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::task;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IncomingEntry {
    pub vault_path: String,
    /// Vault folder name — Obsidian's URI handler resolves vaults by name.
    pub vault_name: String,
    pub dreamnode_path: String,
    pub dreamnode_uuid: String,
    pub dreamnode_name: String,
    /// "dream" | "dreamer" — drives the ring color on the mini-node.
    pub node_type: String,
    /// Absolute path to the DreamTalk media, when it exists on disk.
    pub dream_talk_path: Option<String>,
    /// Total new commits across all peer remotes.
    pub total_commits: u32,
    /// Peer remote names contributing commits.
    pub peers: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutboxEntry {
    pub vault_path: String,
    pub vault_name: String,
    pub dreamnode_path: String,
    pub dreamnode_uuid: String,
    pub dreamnode_name: String,
    pub node_type: String,
    pub dream_talk_path: Option<String>,
    pub commits_unpushed: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityScanResult {
    pub incoming: Vec<IncomingEntry>,
    pub outgoing: Vec<OutboxEntry>,
    /// Unix epoch milliseconds of scan completion.
    pub scanned_at_ms: u64,
}

/// Minimal .udd fields the feed needs.
struct NodeMeta {
    uuid: String,
    name: String,
    node_type: String,
    dream_talk: Option<String>,
}

/// Run a full scan (inbox + outbox) across every registered vault, cache the
/// result on AppState, refresh the derived peer registry, update the tray
/// indicator, and notify listeners. This is THE scan entry point — the
/// scheduler and the dashboard Refresh both come through here.
pub async fn scan_all(state: Arc<AppState>, handle: Option<&AppHandle>) -> ActivityScanResult {
    let vault_paths: Vec<PathBuf> = state
        .settings
        .lock()
        .unwrap()
        .vault_registry
        .iter()
        .map(|v| PathBuf::from(&v.path))
        .collect();

    // Thumbnails are served over the asset protocol; make sure every
    // registered vault is readable there (idempotent, covers vaults added
    // after launch).
    if let Some(handle) = handle {
        for vault in &vault_paths {
            let _ = handle.asset_protocol_scope().allow_directory(vault, true);
        }
    }

    let helper_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    // Peer classification (#409 invariant 2) needs to know who "me" is:
    // a peer remote is a GitHub remote owned by someone who ISN'T me.
    let my_username = task::spawn_blocking(|| crate::github::gh_status().username)
        .await
        .ok()
        .flatten()
        .map(|u| u.to_lowercase());

    let mut handles = Vec::new();
    for vault in vault_paths {
        let helper_dir = helper_dir.clone();
        let me = my_username.clone();
        handles.push(task::spawn_blocking(move || scan_vault(&vault, helper_dir.as_deref(), me.as_deref())));
    }

    let mut incoming = Vec::new();
    let mut outgoing = Vec::new();
    let mut usernames: HashSet<String> = HashSet::new();
    for h in handles {
        if let Ok((inn, out, users)) = h.await {
            incoming.extend(inn);
            outgoing.extend(out);
            usernames.extend(users);
        }
    }

    let scanned_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let result = ActivityScanResult { incoming, outgoing, scanned_at_ms };

    // Cache for instant dashboard rendering.
    *state.activity.lock().unwrap() = Some(result.clone());

    // Derived peer-registry refresh (upsert only — never remove; remotes are
    // the source of truth and a peer absent from one scan isn't gone).
    if let Some(handle) = handle {
        refresh_peer_registry(&state, handle, &usernames);
        update_tray_indicator(handle, &result);
    }

    // Notify plugin-side listeners over the IPC event bus.
    state.event_bus.emit(
        "activity-updated",
        serde_json::json!({
            "incoming": result.incoming.len(),
            "outgoing": result.outgoing.len(),
            "scannedAtMs": result.scanned_at_ms,
        }),
    );

    result
}

/// Periodic background scan loop. Interval comes from settings
/// (`activityScanIntervalMinutes`, default 45; 0 disables — rechecked every
/// few minutes so re-enabling doesn't need a daemon restart). The first scan
/// runs shortly after launch so the feed populates without user action.
pub async fn run_scheduler(state: Arc<AppState>, handle: AppHandle) {
    // Let startup (plugin health checks, IPC server) settle first.
    tokio::time::sleep(std::time::Duration::from_secs(20)).await;

    loop {
        let interval_min = state
            .settings
            .lock()
            .unwrap()
            .activity_scan_interval_minutes;
        let have_vaults = !state.settings.lock().unwrap().vault_registry.is_empty();

        if interval_min == 0 || !have_vaults {
            // Disabled or nothing to scan — recheck periodically.
            tokio::time::sleep(std::time::Duration::from_secs(300)).await;
            continue;
        }

        tracing::info!(target: "activity", "scheduled scan starting");
        let result = scan_all(state.clone(), Some(&handle)).await;
        tracing::info!(
            target: "activity",
            incoming = result.incoming.len(),
            outgoing = result.outgoing.len(),
            "scheduled scan complete"
        );

        tokio::time::sleep(std::time::Duration::from_secs(u64::from(interval_min) * 60)).await;
    }
}

fn refresh_peer_registry(state: &AppState, handle: &AppHandle, usernames: &HashSet<String>) {
    if usernames.is_empty() {
        return;
    }
    let mut changed = false;
    {
        let mut s = state.settings.lock().unwrap();
        for u in usernames {
            if !s.peer_registry.iter().any(|p| &p.github_username == u) {
                s.peer_registry.push(crate::settings::RegisteredPeer {
                    github_username: u.clone(),
                    name: u.clone(),
                });
                changed = true;
            }
        }
    }
    if changed {
        if let Err(e) = state.save_settings(handle) {
            tracing::warn!(target: "activity", error = %e, "peer registry save failed");
        }
        let snapshot = state.settings.lock().unwrap().clone();
        state
            .event_bus
            .emit("settings-changed", serde_json::json!({ "settings": snapshot }));
    }
}

/// Tray indicator: on platforms that support tray title text (macOS), show
/// the number of DreamNodes with incoming commits; clear when none.
/// Tooltip carries the same info everywhere.
fn update_tray_indicator(handle: &AppHandle, result: &ActivityScanResult) {
    if let Some(tray) = handle.tray_by_id("main") {
        let n = result.incoming.len();
        if n > 0 {
            let _ = tray.set_title(Some(n.to_string()));
            let _ = tray.set_tooltip(Some(format!("InterBrain — {n} incoming update(s)")));
        } else {
            let _ = tray.set_title(None::<String>);
            let _ = tray.set_tooltip(Some("InterBrain".to_string()));
        }
    }
}

/// Walk one vault's DreamNodes (top-level directories with .udd) and collect
/// aggregated inbox entries, outbox entries, and peer usernames.
fn scan_vault(
    vault: &Path,
    helper_dir: Option<&Path>,
    my_username: Option<&str>,
) -> (Vec<IncomingEntry>, Vec<OutboxEntry>, HashSet<String>) {
    let mut incoming = Vec::new();
    let mut outgoing = Vec::new();
    let mut usernames = HashSet::new();
    let vault_name = vault
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();
    let read = match std::fs::read_dir(vault) {
        Ok(r) => r,
        Err(_) => return (incoming, outgoing, usernames),
    };
    for entry in read.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let udd = path.join(".udd");
        if !udd.exists() {
            continue;
        }
        let meta = match read_udd(&udd) {
            Some(m) => m,
            None => continue,
        };
        // DreamTalk media path, when the file actually exists.
        let dream_talk_path = meta.dream_talk.as_ref().and_then(|rel| {
            let p = path.join(rel);
            if p.is_file() {
                Some(p.to_string_lossy().to_string())
            } else {
                None
            }
        });

        // Outbox: local commits origin doesn't have yet. Local, no network.
        let unpushed = commits_unpushed(&path);
        if unpushed > 0 {
            outgoing.push(OutboxEntry {
                vault_path: vault.to_string_lossy().to_string(),
                vault_name: vault_name.clone(),
                dreamnode_path: path.to_string_lossy().to_string(),
                dreamnode_uuid: meta.uuid.clone(),
                dreamnode_name: meta.name.clone(),
                node_type: meta.node_type.clone(),
                dream_talk_path: dream_talk_path.clone(),
                commits_unpushed: unpushed,
            });
        }

        // Inbox: fetch each peer remote, aggregate commit counts per node.
        let mut total: u32 = 0;
        let mut peers: Vec<String> = Vec::new();
        for (remote, peer_hint) in list_peer_remotes(&path, my_username) {
            if let Some(user) = peer_hint {
                usernames.insert(user);
            }
            let _ = run_git(&path, &["fetch", &remote], helper_dir);
            let ahead = commits_ahead(&path, &remote);
            if ahead > 0 {
                total += ahead;
                peers.push(remote);
            }
        }
        if total > 0 {
            peers.sort();
            incoming.push(IncomingEntry {
                vault_path: vault.to_string_lossy().to_string(),
                vault_name: vault_name.clone(),
                dreamnode_path: path.to_string_lossy().to_string(),
                dreamnode_uuid: meta.uuid,
                dreamnode_name: meta.name,
                node_type: meta.node_type,
                dream_talk_path,
                total_commits: total,
                peers,
            });
        }
    }
    (incoming, outgoing, usernames)
}

fn read_udd(udd_path: &Path) -> Option<NodeMeta> {
    let content = std::fs::read_to_string(udd_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    let uuid = v.get("uuid").and_then(|x| x.as_str())?.to_string();
    let name = v
        .get("title")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            udd_path
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|f| f.to_str())
                .map(|s| s.to_string())
                .unwrap_or_default()
        });
    let node_type = v
        .get("type")
        .and_then(|x| x.as_str())
        .unwrap_or("dream")
        .to_string();
    let dream_talk = v
        .get("dreamTalk")
        .and_then(|x| x.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    Some(NodeMeta { uuid, name, node_type, dream_talk })
}

/// List peer remotes (#409 invariant 2): a peer is a GitHub remote owned by
/// someone who ISN'T me. Legacy `github` remotes pointing at my own repo,
/// dead `rad://` remotes, and filesystem-path remotes are NOT peers (the
/// old "any non-origin remote" rule misread all three). Legacy
/// interbrain:// URLs count as peers via their ?peer= owner hint. Returns
/// (remote name, extracted GitHub username when derivable).
fn list_peer_remotes(repo: &Path, my_username: Option<&str>) -> Vec<(String, Option<String>)> {
    // Read DECLARED remote URLs from config, not `git remote -v` — the
    // latter applies url.<base>.insteadOf rewrites, which are transport
    // plumbing (https↔ssh swaps, local test mirrors) and mustn't change
    // WHO a remote is.
    let mut cmd = Command::new("git");
    cmd.args(["config", "--get-regexp", r"^remote\..*\.url$"]).current_dir(repo);
    suppress_console_window(&mut cmd);
    let out = match cmd.output() {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };
    let mut seen: std::collections::HashMap<String, Option<String>> = std::collections::HashMap::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        // line: "remote.<name>.url <url>"
        let Some(rest) = line.strip_prefix("remote.") else { continue };
        let Some((name, url)) = rest.split_once(".url ") else { continue };
        let (name, url) = (name.trim(), url.trim());
        if url.is_empty() {
            continue;
        }
        if name == "origin" {
            continue;
        }
        let is_github = url.starts_with("https://github.com/")
            || url.starts_with("http://github.com/")
            || url.starts_with("git@github.com:");
        let is_interbrain = url.starts_with("interbrain://");
        if !is_github && !is_interbrain {
            continue; // rad://, local paths, etc. — unresolvable legacy config
        }
        let owner = peer_username_from_url(url);
        if let (Some(me), Some(o)) = (my_username, owner.as_deref()) {
            if o.eq_ignore_ascii_case(me) {
                continue; // my own repo (legacy `github` remote) — not a peer
            }
        }
        seen.entry(name.to_string()).or_insert(owner);
    }
    seen.into_iter().collect()
}

/// Extract the peer's GitHub username from a remote URL: the owner segment
/// of a native github.com URL, or the ?peer= hint of a legacy interbrain://
/// URL (hints may be `<owner>` or `<owner>/<repo>`, percent-encoded).
fn peer_username_from_url(url: &str) -> Option<String> {
    if let Some(rest) = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
        .or_else(|| url.strip_prefix("git@github.com:"))
    {
        let owner = rest.split('/').next()?.trim();
        if !owner.is_empty() {
            return Some(owner.to_string());
        }
        return None;
    }
    let query = url.split_once('?')?.1;
    for pair in query.split('&') {
        if let Some(v) = pair.strip_prefix("peer=") {
            let decoded = urlencoding::decode(v).ok()?;
            let owner = decoded.split('/').next()?.trim().to_string();
            if !owner.is_empty() {
                return Some(owner);
            }
        }
    }
    None
}

fn commits_ahead(repo: &Path, remote: &str) -> u32 {
    rev_list_count(repo, &format!("HEAD..{remote}/main"))
}

/// Commits on local HEAD that origin/main doesn't have. 0 when origin (or
/// its main) doesn't exist — a node never shared has no outbox story yet.
fn commits_unpushed(repo: &Path) -> u32 {
    rev_list_count(repo, "origin/main..HEAD")
}

fn rev_list_count(repo: &Path, spec: &str) -> u32 {
    let mut cmd = Command::new("git");
    cmd.arg("rev-list").arg("--count").arg(spec).current_dir(repo);
    suppress_console_window(&mut cmd);
    match cmd.output() {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .trim()
            .parse::<u32>()
            .unwrap_or(0),
        _ => 0,
    }
}

fn run_git(repo: &Path, args: &[&str], helper_dir: Option<&Path>) -> std::io::Result<std::process::ExitStatus> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(repo);
    if let Some(dir) = helper_dir {
        // Prepend daemon's install dir to PATH so `git-remote-interbrain` is found.
        let cur = std::env::var("PATH").unwrap_or_default();
        let sep = if cfg!(windows) { ";" } else { ":" };
        let new_path = format!("{}{}{}", dir.display(), sep, cur);
        cmd.env("PATH", new_path);
    }
    suppress_console_window(&mut cmd);
    cmd.status()
}
