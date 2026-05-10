//! Activity scanning: walk every registered vault's DreamNodes, fetch from
//! each interbrain:// peer remote, and report which DreamNodes have new
//! commits available from which peers.
//!
//! This is the data layer behind the dashboard's Activity tab. The scan is
//! invoked manually (user clicks "Scan") and may take a while because each
//! peer fetch is a real WebRTC handshake. Future: persist scan results,
//! schedule periodic scans, push update notifications.

use crate::commands::AppState;
use crate::vaults::suppress_console_window;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
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

/// Walk every registered vault, run a fetch against each peer remote on
/// each DreamNode, and report all DreamNode/peer pairs that have at least
/// one new commit pending. Runs the fetches concurrently per-vault for
/// reasonable throughput.
pub async fn scan_updates(state: Arc<AppState>) -> Vec<ActivityEntry> {
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

    let mut all = Vec::new();
    for h in handles {
        if let Ok(entries) = h.await {
            all.extend(entries);
        }
    }
    all
}

/// Walk one vault's DreamNodes (top-level directories with .udd) and
/// collect activity entries.
fn scan_vault(vault: &Path, helper_dir: Option<&Path>) -> Vec<ActivityEntry> {
    let mut out = Vec::new();
    let read = match std::fs::read_dir(vault) {
        Ok(r) => r,
        Err(_) => return out,
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
        for entry in scan_dreamnode(&path, &uuid, &name, helper_dir) {
            out.push(entry);
        }
    }
    out
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

/// Run `git remote -v` to find peer remotes (interbrain://...), fetch each,
/// then count commits each peer's main is ahead of local main.
fn scan_dreamnode(
    repo: &Path,
    uuid: &str,
    name: &str,
    helper_dir: Option<&Path>,
) -> Vec<ActivityEntry> {
    let mut out = Vec::new();
    let remotes = list_peer_remotes(repo);
    if remotes.is_empty() {
        return out;
    }
    for remote in &remotes {
        // Fetch (with helper on PATH so git can find git-remote-interbrain).
        let _ = run_git(repo, &["fetch", remote], helper_dir);
        // Count how many commits the peer is ahead of us.
        let ahead = commits_ahead(repo, remote);
        if ahead > 0 {
            out.push(ActivityEntry {
                vault_path: repo
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default(),
                dreamnode_path: repo.to_string_lossy().to_string(),
                dreamnode_uuid: uuid.to_string(),
                dreamnode_name: name.to_string(),
                peer_name: remote.clone(),
                commits_ahead: ahead,
            });
        }
    }
    out
}

fn list_peer_remotes(repo: &Path) -> Vec<String> {
    let mut cmd = Command::new("git");
    cmd.arg("remote").arg("-v").current_dir(repo);
    suppress_console_window(&mut cmd);
    let out = match cmd.output() {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };
    let mut seen = std::collections::HashSet::new();
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
        seen.insert(name.to_string());
    }
    seen.into_iter().collect()
}

fn commits_ahead(repo: &Path, remote: &str) -> u32 {
    let spec = format!("HEAD..{remote}/main");
    let mut cmd = Command::new("git");
    cmd.arg("rev-list").arg("--count").arg(&spec).current_dir(repo);
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
