//! `git-remote-interbrain` — git remote helper for `interbrain://<uuid>` URLs.
//!
//! Resolution order:
//!   1. Ask daemon for a local clone of the UUID. If found, run
//!      `git upload-pack`/`receive-pack` against the local path and pipe
//!      the bytes back to git. (Same path served by the local UUID index —
//!      submodules already in your vault never hit the network.)
//!   2. If the URL has `?peer=<github-username>` hints OR the daemon's
//!      peer registry has known peers, ask the daemon to resolve the UUID
//!      to a GitHub URL via that peer, then delegate to git's native
//!      `remote-https` helper for the actual transfer. Bytes flow over
//!      GitHub's HTTPS, authenticated by the user's gh CLI credentials.
//!   3. Otherwise, error out clearly.
//!
//! Speaks the standard remote-helper protocol on stdin/stdout. See
//! `gitremote-helpers(1)` for the contract.

use anyhow::{anyhow, bail, Context, Result};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use url::Url;

const DAEMON_BUNDLE_ID: &str = "org.projectliminality.interbrain";

fn main() {
    if let Err(e) = run() {
        eprintln!("git-remote-interbrain: {e:#}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    // Args are: [program, remote_name, url]
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        bail!("usage: git-remote-interbrain <remote-name> <url>");
    }
    let raw_url = &args[2];

    let parsed = parse_interbrain_url(raw_url)
        .with_context(|| format!("parse url {raw_url}"))?;

    // Resolve via daemon — local first, then peer's GitHub repo.
    let local_path = resolve_locally(&parsed.uuid)?;

    // If local resolve failed, we need to delegate to git-remote-https.
    // Do this BEFORE entering the helper protocol loop — once we start
    // responding to git's `capabilities` / `connect` commands, git
    // commits to talking to *us* and won't restart the conversation
    // with the helper we exec'd. The only way to delegate cleanly is to
    // replace ourselves with git-remote-https before reading any stdin.
    if local_path.is_none() {
        return delegate_to_https(&args, &parsed);
    }

    let stdin = std::io::stdin();
    let mut stdin_reader = BufReader::new(stdin.lock());
    let stdout = std::io::stdout();
    let mut stdout_writer = stdout.lock();

    // Helper command loop.
    loop {
        let mut line = String::new();
        let n = stdin_reader.read_line(&mut line)?;
        if n == 0 { return Ok(()); } // EOF — git closed us
        let cmd = line.trim();

        if cmd == "capabilities" {
            // We support the simplest possible mode: `connect`. This delegates
            // to a remote git service (`git-upload-pack` or `git-receive-pack`)
            // and pipes its bytes verbatim. Works for clone, fetch, and push.
            writeln!(stdout_writer, "connect")?;
            writeln!(stdout_writer)?;
            stdout_writer.flush()?;
            continue;
        }

        if let Some(service) = cmd.strip_prefix("connect ") {
            // Validate service.
            if service != "git-upload-pack" && service != "git-receive-pack" {
                bail!("unsupported service: {service}");
            }

            // Local path resolved → acknowledge connect, exec the git
            // service (upload-pack/receive-pack) against the local path.
            // This continues the protocol git already started talking
            // with us. (The GitHub-delegation case was handled before
            // entering this loop.)
            let path = local_path
                .as_ref()
                .expect("local_path must be Some by this point — None case branched above");
            writeln!(stdout_writer)?;
            stdout_writer.flush()?;

            let status = Command::new(service)
                .arg(path)
                .stdin(Stdio::inherit())
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .status()
                .with_context(|| format!("spawn {service}"))?;
            if !status.success() {
                bail!("{service} exited {status}");
            }
            return Ok(());
        }

        if cmd.is_empty() {
            continue;
        }

        // Unknown command — emit empty response per protocol convention.
        writeln!(stdout_writer)?;
        stdout_writer.flush()?;
    }
}

#[derive(Debug)]
struct ParsedUrl {
    uuid: String,
    peer_hints: Vec<String>,
}

fn parse_interbrain_url(raw: &str) -> Result<ParsedUrl> {
    // Accept: interbrain://<uuid>[?peer=<username>&peer=<username>]
    let url = Url::parse(raw).with_context(|| format!("invalid url: {raw}"))?;
    if url.scheme() != "interbrain" {
        bail!("expected interbrain:// scheme, got {}", url.scheme());
    }
    let uuid = url
        .host_str()
        .ok_or_else(|| anyhow!("no uuid in url"))?
        .to_string();
    let peer_hints: Vec<String> = url
        .query_pairs()
        .filter(|(k, _)| k == "peer")
        .map(|(_, v)| v.into_owned())
        .collect();
    Ok(ParsedUrl { uuid, peer_hints })
}

/// Transitivity: when called for a submodule whose URL is a bare
/// `interbrain://<uuid>` with no peer hints, derive implicit hints from
/// EVERY GitHub remote on the parent repo (origin first, then each peer
/// remote in declaration order). Under rc.21's sovereignty model the
/// parent has both:
///   - origin → recipient's own outbox (e.g., InterfaceGuy/Cylinder1)
///   - peer remotes → senders' outboxes (e.g., projectliminality →
///     ProjectLiminality/Cylinder1)
/// Submodules share names across peers (Circle is always called Circle),
/// so trying `<each-owner>/<submodule-name>` covers the cases where
/// either the recipient or any peer has the submodule's outbox.
///
/// Returns hints in the order git printed the remotes, deduplicated by
/// owner.
///
/// Implementation note: git invokes the remote helper with cwd set to the
/// SUBMODULE's pre-clone directory (not the parent's toplevel). So plain
/// `git remote -v` returns nothing — there's no git dir at cwd. We need
/// to walk up to find the parent's `.git` and run from there.
fn derive_transitive_peer_hints(remote_name: &str) -> Vec<String> {
    let cwd_dbg = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".into());
    eprintln!("git-remote-interbrain: helper cwd = {cwd_dbg}");
    let parent_repo = match find_parent_repo() {
        Some(p) => p,
        None => {
            eprintln!(
                "git-remote-interbrain: could not locate parent repo for transitivity (cwd={cwd_dbg})"
            );
            return Vec::new();
        }
    };
    eprintln!(
        "git-remote-interbrain: deriving transitive hints from parent {}",
        parent_repo.display()
    );
    // CRITICAL: When git invokes the helper during a submodule clone, it
    // sets GIT_DIR / GIT_WORK_TREE pointing at the submodule's gitdir-to-be
    // (e.g., Cylinder1/.git/modules/Circle). If we inherit those env vars
    // when shelling out to git, our `git remote -v` reads config from
    // THAT gitdir, not from cwd's. Result: empty remote list silently.
    // Unset them so git falls back to cwd-based discovery.
    let out = match std::process::Command::new("git")
        .current_dir(&parent_repo)
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_OBJECT_DIRECTORY")
        .env_remove("GIT_COMMON_DIR")
        .args(["remote", "-v"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        Ok(o) => {
            eprintln!(
                "git-remote-interbrain: git remote -v in parent failed: {}",
                String::from_utf8_lossy(&o.stderr).trim()
            );
            return Vec::new();
        }
        Err(e) => {
            eprintln!("git-remote-interbrain: git spawn failed: {e}");
            return Vec::new();
        }
    };
    let text = String::from_utf8_lossy(&out.stdout);

    let mut seen = std::collections::HashSet::new();
    let mut hints = Vec::new();
    for line in text.lines() {
        // line: "<remote-name>\t<url> (fetch|push)"
        let url = match line.split_whitespace().nth(1) {
            Some(u) => u,
            None => continue,
        };
        let parts = url
            .strip_prefix("https://github.com/")
            .or_else(|| url.strip_prefix("http://github.com/"))
            .or_else(|| url.strip_prefix("git@github.com:"));
        let path = match parts {
            Some(p) => p,
            None => continue,
        };
        let owner = match path.splitn(2, '/').next() {
            Some(o) if !o.is_empty() => o,
            _ => continue,
        };
        if !seen.insert(owner.to_string()) {
            continue;
        }
        hints.push(format!("{owner}/{remote_name}"));
    }
    hints
}

/// Resolve the UUID to a GitHub HTTPS URL via the daemon, then replace
/// ourselves with `git remote-https <remote-name> <https-url>`. Git
/// invoked us; from git's perspective we vanish and git-remote-https
/// takes over the helper protocol from scratch — clean handshake, no
/// risk of stdin/stdout deadlock from us having half-consumed the
/// conversation.
fn delegate_to_https(args: &[String], parsed: &ParsedUrl) -> Result<()> {
    let port = read_daemon_port()?;

    // Build the candidate peer-hint list. Start with explicit hints from
    // the URL (`?peer=<owner>/<repo>`); fall back to transitivity from
    // every GitHub remote on the parent repo.
    let mut hints: Vec<String> = parsed.peer_hints.clone();
    if hints.is_empty() {
        let submodule_name = lookup_submodule_name(&parsed.uuid).unwrap_or_else(|| {
            eprintln!(
                "git-remote-interbrain: could not find submodule name in .gitmodules; falling back to args[1]={}",
                &args[1]
            );
            args[1].clone()
        });
        eprintln!("git-remote-interbrain: submodule name resolved to: {submodule_name}");
        for transitive in derive_transitive_peer_hints(&submodule_name) {
            eprintln!("git-remote-interbrain: trying transitive hint: {transitive}");
            hints.push(transitive);
        }
    }
    if hints.is_empty() {
        bail!(
            "uuid {} not found locally and no peer hints (explicit or transitive) — cannot resolve",
            parsed.uuid
        );
    }

    // Ask the daemon to verify each hint resolves to a reachable GitHub
    // repo. First success wins.
    let mut last_err: Option<String> = None;
    let mut resolved_url: Option<String> = None;
    for peer in &hints {
        let payload = serde_json::json!({ "uuid": parsed.uuid, "peer": peer });
        match call_daemon(port, "resolve-peer-url", payload) {
            Ok(resp) => {
                if let Some(u) = resp.get("url").and_then(|v| v.as_str()) {
                    resolved_url = Some(u.to_string());
                    break;
                }
                last_err = Some(format!("response missing url: {resp}"));
            }
            Err(e) => last_err = Some(format!("peer {peer}: {e}")),
        }
    }
    let url = resolved_url.ok_or_else(|| {
        anyhow!(
            "could not resolve uuid {} via any peer: {}",
            parsed.uuid,
            last_err.unwrap_or_else(|| "unknown".into())
        )
    })?;

    eprintln!("git-remote-interbrain: delegating to git-remote-https with url: {url}");

    // Replace ourselves with git-remote-https. Git's stdin/stdout/stderr
    // are inherited; the HTTPS helper starts a fresh helper-protocol
    // conversation with git from the top (capabilities, list, fetch, ...).
    //
    // On Unix we'd `exec` for true PID replacement. On Windows there's
    // no exec; we spawn and wait, then propagate exit status. Either way
    // we MUST NOT touch our own stdin or write to stdout — git's bytes
    // need to flow uninterrupted to/from git-remote-https.
    let status = Command::new("git")
        .arg("remote-https")
        .arg(&args[1])
        .arg(&url)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .with_context(|| format!("exec git remote-https {url}"))?;
    if !status.success() {
        bail!("git remote-https exited {status}");
    }
    Ok(())
}

/// Find the submodule name in the parent's `.gitmodules` whose URL matches
/// the interbrain UUID we're being asked to resolve. Returns None if no
/// match (e.g., this isn't actually a submodule clone, just a manual
/// `git fetch interbrain://<uuid>`).
fn lookup_submodule_name(uuid: &str) -> Option<String> {
    let parent = find_parent_repo()?;
    let gitmodules = parent.join(".gitmodules");
    if !gitmodules.exists() {
        return None;
    }
    let needle_url = format!("interbrain://{uuid}");
    // Use git config to parse — it handles whitespace and section names
    // correctly. `--get-regexp` returns lines like `submodule.Circle.url <url>`.
    let out = std::process::Command::new("git")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_OBJECT_DIRECTORY")
        .env_remove("GIT_COMMON_DIR")
        .args(["config", "--file"])
        .arg(&gitmodules)
        .args(["--get-regexp", r"submodule\..*\.url"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&out.stdout);
    for line in text.lines() {
        // line: "submodule.<NAME>.url <URL>"
        let mut parts = line.splitn(2, ' ');
        let key = parts.next()?;
        let url = parts.next()?.trim();
        if url == needle_url {
            // key is `submodule.<NAME>.url` — extract NAME.
            let rest = key.strip_prefix("submodule.")?;
            let name = rest.strip_suffix(".url")?;
            return Some(name.to_string());
        }
    }
    None
}

/// Walk up from cwd looking for a `.git` directory or gitlink file.
/// Returns the path of the containing repo, or None if we're outside any
/// repo.
fn find_parent_repo() -> Option<std::path::PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    eprintln!("git-remote-interbrain: walking up from {}", cwd.display());
    let mut here: Option<&std::path::Path> = Some(cwd.as_path());
    while let Some(dir) = here {
        let dot_git = dir.join(".git");
        let exists = dot_git.exists();
        eprintln!(
            "git-remote-interbrain:   check {} → .git exists={}",
            dir.display(),
            exists
        );
        if exists {
            return Some(dir.to_path_buf());
        }
        here = dir.parent();
    }
    None
}

fn resolve_locally(uuid: &str) -> Result<Option<String>> {
    let port = read_daemon_port()?;
    let resp = call_daemon(port, "resolve-uuid", serde_json::json!({ "uuid": uuid }))?;
    let preferred = resp
        .get("preferred")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    Ok(preferred)
}

fn read_daemon_port() -> Result<u16> {
    let home = dirs::home_dir().ok_or_else(|| anyhow!("no home dir"))?;
    let config_dir = if cfg!(target_os = "macos") {
        home.join("Library/Application Support").join(DAEMON_BUNDLE_ID)
    } else if cfg!(target_os = "windows") {
        let appdata = env::var("APPDATA").map(std::path::PathBuf::from)
            .unwrap_or_else(|_| home.join("AppData/Roaming"));
        appdata.join(DAEMON_BUNDLE_ID)
    } else {
        let xdg = env::var("XDG_CONFIG_HOME").map(std::path::PathBuf::from)
            .unwrap_or_else(|_| home.join(".config"));
        xdg.join(DAEMON_BUNDLE_ID)
    };
    let port_file = config_dir.join("ipc-port");
    let text = std::fs::read_to_string(&port_file)
        .with_context(|| format!("read {}", port_file.display()))?;
    text.trim().parse().with_context(|| format!("parse port: {}", text.trim()))
}

/// Make a single synchronous IPC request to the daemon over WebSocket.
/// Connects, sends one request, reads one response, closes.
fn call_daemon(port: u16, op: &str, payload: serde_json::Value) -> Result<serde_json::Value> {
    use std::net::TcpStream;
    use tungstenite::{client::IntoClientRequest, protocol::Message};

    let url = format!("ws://127.0.0.1:{port}");
    let req = url.into_client_request()?;
    let stream = TcpStream::connect(("127.0.0.1", port))
        .with_context(|| format!("connect 127.0.0.1:{port}"))?;
    let (mut ws, _) = tungstenite::client(req, stream)
        .with_context(|| "ws handshake")?;

    let frame = serde_json::json!({
        "kind": "request",
        "id": "1",
        "op": op,
        "payload": payload,
    });
    ws.send(Message::Text(frame.to_string()))?;

    loop {
        match ws.read()? {
            Message::Text(text) => {
                let parsed: serde_json::Value = serde_json::from_str(&text)?;
                if parsed.get("kind").and_then(|v| v.as_str()) == Some("response") {
                    if parsed.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                        let _ = ws.close(None);
                        return Ok(parsed.get("payload").cloned().unwrap_or(serde_json::Value::Null));
                    }
                    let err_msg = parsed
                        .get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .unwrap_or("unknown error");
                    bail!("daemon error: {err_msg}");
                }
            }
            Message::Close(_) => bail!("daemon closed connection"),
            Message::Ping(p) => ws.send(Message::Pong(p))?,
            _ => {}
        }
    }
}
