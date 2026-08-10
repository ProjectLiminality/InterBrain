//! Activity scanning: the data layer behind the dashboard's Activity tab
//! (issue #393 — "Activity feed: inbox + outbox").
//!
//! Inbox: walk every registered vault's DreamNodes, fetch from each
//! interbrain:// peer remote, and report which DreamNodes have new commits
//! available from which peers.
//!
//! Outbox: report DreamNodes whose local `main` is ahead of `origin` —
//! committed-but-unpushed work the user can publish ("Share") from the feed.
//! Uncommitted edits are work-in-progress, not feed material.
//!
//! Scans run on a periodic schedule (see `run_scheduler`) and on demand from
//! the dashboard. Results are cached in `AppState.activity` so the tab
//! renders instantly from the last scan. Peer usernames encountered during a
//! scan are upserted into the daemon's `peer_registry` — the registry is a
//! derived cache, never authoritative; per-repo git remotes remain the
//! source of truth for who collaborates on what.

use crate::commands::AppState;
use crate::vaults::suppress_console_window;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::task;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub vault_path: String,
    pub dreamnode_path: String,
    pub dreamnode_uuid: String,
    pub dreamnode_name: String,
    pub peer_name: String,
    pub commits_ahead: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutboxEntry {
    pub vault_path: String,
    pub dreamnode_path: String,
    pub dreamnode_uuid: String,
    pub dreamnode_name: String,
    pub commits_unpushed: u32,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityScanResult {
    pub incoming: Vec<ActivityEntry>,
    pub outgoing: Vec<OutboxEntry>,
    /// Unix epoch milliseconds of scan completion.
    pub scanned_at_ms: u64,
}

/// Run a full scan (inbox + outbox) across every registered vault, cache the
/// result on AppState, refresh the derived peer registry, update the tray
/// indicator, and notify listeners. This is THE scan entry point — the
/// scheduler, the dashboard Refresh, and the legacy proxy all come through
/// here.
pub async fn scan_all(state: Arc<AppState>, handle: Option<&AppHandle>) -> ActivityScanResult {
    let vault_paths: Vec<PathBuf> = state
        .settings
        .lock()
        .unwrap()
        .vault_registry
        .iter()
        .map(|v| PathBuf::from(&v.path))
        .collect();

    let helper_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let mut handles = Vec::new();
    for vault in vault_paths {
        let helper_dir = helper_dir.clone();
        handles.push(task::spawn_blocking(move || scan_vault(&vault, helper_dir.as_deref())));
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

/// Push a DreamNode's local commits to its origin (the user's outbox repo).
/// The "[Share]" action on outbox feed rows. Validates the path is inside a
/// registered vault so the IPC surface can't push arbitrary repos.
pub fn share_node(state: &AppState, dreamnode_path: &str) -> Result<(), String> {
    let node = PathBuf::from(dreamnode_path);
    let registered = state
        .settings
        .lock()
        .unwrap()
        .vault_registry
        .iter()
        .any(|v| node.starts_with(&v.path));
    if !registered {
        return Err("path is not inside a registered vault".into());
    }
    if !node.join(".udd").exists() {
        return Err("path is not a DreamNode (no .udd)".into());
    }

    let helper_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let status = run_git(&node, &["push", "origin"], helper_dir.as_deref())
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("git push origin failed".into());
    }

    // Drop the node from the cached outbox so the feed reflects the share
    // immediately without a full rescan.
    if let Some(cached) = state.activity.lock().unwrap().as_mut() {
        cached.outgoing.retain(|e| e.dreamnode_path != dreamnode_path);
    }
    Ok(())
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
/// the number of DreamNode/peer pairs with incoming commits; clear when none.
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
/// inbox entries, outbox entries, and peer usernames seen on remotes.
fn scan_vault(
    vault: &Path,
    helper_dir: Option<&Path>,
) -> (Vec<ActivityEntry>, Vec<OutboxEntry>, HashSet<String>) {
    let mut incoming = Vec::new();
    let mut outgoing = Vec::new();
    let mut usernames = HashSet::new();
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
        let (uuid, name) = match read_uuid_and_name(&udd) {
            Some(p) => p,
            None => continue,
        };

        // Outbox: local commits origin doesn't have yet. Local, no network.
        let unpushed = commits_unpushed(&path);
        if unpushed > 0 {
            outgoing.push(OutboxEntry {
                vault_path: vault.to_string_lossy().to_string(),
                dreamnode_path: path.to_string_lossy().to_string(),
                dreamnode_uuid: uuid.clone(),
                dreamnode_name: name.clone(),
                commits_unpushed: unpushed,
            });
        }

        // Inbox: fetch each peer remote, count commits ahead.
        for (remote, peer_hint) in list_peer_remotes(&path) {
            if let Some(user) = peer_hint {
                usernames.insert(user);
            }
            let _ = run_git(&path, &["fetch", &remote], helper_dir);
            let ahead = commits_ahead(&path, &remote);
            if ahead > 0 {
                incoming.push(ActivityEntry {
                    vault_path: vault.to_string_lossy().to_string(),
                    dreamnode_path: path.to_string_lossy().to_string(),
                    dreamnode_uuid: uuid.clone(),
                    dreamnode_name: name.clone(),
                    peer_name: remote.clone(),
                    commits_ahead: ahead,
                });
            }
        }
    }
    (incoming, outgoing, usernames)
}

fn read_uuid_and_name(udd_path: &Path) -> Option<(String, String)> {
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
    Some((uuid, name))
}

/// List peer remotes: name + the GitHub username extracted from the
/// `interbrain://<uuid>?peer=<hint>` URL when present. Hints may be
/// `<owner>` or `<owner>/<repo>` (percent-encoded); the owner is the
/// username.
fn list_peer_remotes(repo: &Path) -> Vec<(String, Option<String>)> {
    let mut cmd = Command::new("git");
    cmd.arg("remote").arg("-v").current_dir(repo);
    suppress_console_window(&mut cmd);
    let out = match cmd.output() {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };
    let mut seen: std::collections::HashMap<String, Option<String>> = std::collections::HashMap::new();
    for line in String::from_utf8_lossy(&out.stdout).lines() {
        // line: "<name>\t<url> (fetch|push)"
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }
        let name = parts[0];
        let url = parts[1];
        if name == "origin" || !url.starts_with("interbrain://") {
            continue;
        }
        seen.entry(name.to_string())
            .or_insert_with(|| peer_username_from_url(url));
    }
    seen.into_iter().collect()
}

/// Extract the peer's GitHub username from an interbrain:// remote URL.
fn peer_username_from_url(url: &str) -> Option<String> {
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
