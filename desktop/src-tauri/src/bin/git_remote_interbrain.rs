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

            if let Some(path) = local_path.as_ref() {
                // Acknowledge connect (empty line per protocol), then exec
                // the git service against the local path with stdin/stdout
                // inherited.
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

            // Local resolve failed → resolve to a GitHub URL via the daemon
            // and delegate to git's native HTTPS helper (`git-remote-https`).
            //
            // Peer-hint format is `<github-username>/<repo-name>`, which the
            // daemon translates to `https://github.com/<that>`. The UUID is
            // verified after clone via the .udd file.
            let port = read_daemon_port()?;
            if parsed.peer_hints.is_empty() {
                bail!(
                    "uuid {} not found locally and url has no peer hints — cannot resolve",
                    parsed.uuid
                );
            }
            let mut last_err: Option<String> = None;
            let mut resolved_url: Option<String> = None;
            for peer in &parsed.peer_hints {
                let payload = serde_json::json!({
                    "uuid": parsed.uuid,
                    "peer": peer,
                });
                match call_daemon(port, "resolve-peer-url", payload) {
                    Ok(resp) => {
                        if let Some(u) = resp.get("url").and_then(|v| v.as_str()) {
                            resolved_url = Some(u.to_string());
                            break;
                        }
                        last_err = Some(format!("response missing url: {resp}"));
                    }
                    Err(e) => {
                        last_err = Some(format!("peer {peer}: {e}"));
                    }
                }
            }
            let url = resolved_url.ok_or_else(|| {
                anyhow!(
                    "could not resolve uuid {} via any peer: {}",
                    parsed.uuid,
                    last_err.unwrap_or_else(|| "unknown".into())
                )
            })?;

            // Acknowledge connect to git, then delegate to git-remote-https.
            // git's native HTTPS helper handles auth via the configured
            // credential helper (gh CLI sets up `osxkeychain` / `manager` /
            // `cache` depending on platform after `gh auth login`).
            writeln!(stdout_writer)?;
            stdout_writer.flush()?;
            drop(stdin_reader);
            drop(stdout_writer);

            // Re-issue the connect handshake against the HTTPS URL by exec'ing
            // git-remote-https with the resolved URL. Git's stdio is inherited;
            // the HTTPS helper picks up where we left off.
            let status = Command::new("git")
                .arg("remote-https")
                .arg(&args[1]) // remote name
                .arg(&url)
                .stdin(Stdio::inherit())
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .status()
                .with_context(|| format!("exec git remote-https {url}"))?;
            if !status.success() {
                bail!("git remote-https exited {status}");
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
