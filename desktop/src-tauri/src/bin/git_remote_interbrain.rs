//! `git-remote-interbrain` — a git remote helper that resolves
//! `interbrain://<uuid>?peer=<did>` URLs against the InterBrain daemon.
//!
//! Resolution order:
//!   1. Ask daemon for a local clone of the UUID. If found, run
//!      `git upload-pack`/`receive-pack` against the local path and pipe
//!      the bytes back to git.
//!   2. If `?peer=` hints are present, ask daemon to open a WebRTC channel
//!      to one of those peers and pipe pack-protocol bytes through it.
//!   3. Otherwise, error out clearly.
//!
//! Speaks the standard remote-helper protocol on stdin/stdout. See
//! `gitremote-helpers(1)` for the contract.

use anyhow::{anyhow, bail, Context, Result};
use std::env;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::process::{Command, Stdio};
use std::thread;
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

    // Resolve via daemon — local first, then peer hints.
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
                // inherited. After exec returns, the helper exits.
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

            // Local resolve failed → use WebRTC peer transport via daemon.
            // Build the candidate peer list: explicit URL peer hints first,
            // then every peer in the daemon's registry. Try each in order
            // until one succeeds.
            let port = read_daemon_port()?;
            let mut candidates: Vec<String> = parsed.peer_hints.clone();
            if candidates.is_empty() {
                // Ask the daemon for its known peers.
                let peers_resp = call_daemon(port, "list-peers", serde_json::json!({}))?;
                if let Some(arr) = peers_resp.get("peers").and_then(|v| v.as_array()) {
                    for p in arr {
                        if let Some(did) = p.get("did").and_then(|v| v.as_str()) {
                            candidates.push(did.to_string());
                        }
                    }
                }
            }
            if candidates.is_empty() {
                bail!(
                    "uuid {} not found locally; no peer hints in url and no peers registered",
                    parsed.uuid
                );
            }

            // Try each candidate; first one whose relay opens wins.
            let mut last_err: Option<String> = None;
            let mut relay_port: Option<u64> = None;
            for peer_did in &candidates {
                let relay_payload = serde_json::json!({
                    "peerDid": peer_did,
                    "service": service,
                    "uuid": parsed.uuid,
                });
                match call_daemon(port, "open-peer-relay", relay_payload) {
                    Ok(resp) => {
                        if let Some(p) = resp.get("port").and_then(|v| v.as_u64()) {
                            relay_port = Some(p);
                            break;
                        }
                        last_err = Some(format!("relay response missing port: {resp}"));
                    }
                    Err(e) => {
                        last_err = Some(format!("peer {peer_did}: {e}"));
                        // Try the next candidate.
                    }
                }
            }
            let relay_port = relay_port.ok_or_else(|| {
                anyhow!(
                    "no peer could serve uuid {}: {}",
                    parsed.uuid,
                    last_err.unwrap_or_else(|| "unknown".into())
                )
            })?;

            // Acknowledge connect to git: empty line on our stdout, then
            // bridge stdin↔relay socket↔stdout. Git takes over our stdio
            // for the pack-protocol exchange.
            writeln!(stdout_writer)?;
            stdout_writer.flush()?;
            // Drop our stdin/stdout locks so the bridge threads can claim
            // the underlying handles.
            drop(stdin_reader);
            drop(stdout_writer);

            let tcp = TcpStream::connect(("127.0.0.1", relay_port as u16))
                .with_context(|| format!("connect relay 127.0.0.1:{relay_port}"))?;
            bridge_stdio_with_tcp(tcp)?;
            return Ok(());
        }

        if cmd.is_empty() {
            // Blank line ends a command block; for `connect` we never reach
            // here because we exec the service. Otherwise, just continue.
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
    #[allow(dead_code)]
    peer_hints: Vec<String>,
}

fn parse_interbrain_url(raw: &str) -> Result<ParsedUrl> {
    // Accept: interbrain://<uuid>[?peer=<did>&peer=<did>]
    // url::Url requires a // host; the uuid plays the host role.
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

/// Bridge git's stdin/stdout against a TCP socket. Two threads: one copies
/// bytes from stdin to the socket, the other from the socket to stdout.
/// Returns when either side closes.
fn bridge_stdio_with_tcp(tcp: TcpStream) -> Result<()> {
    let tcp_read = tcp.try_clone().context("clone tcp for read thread")?;
    let mut tcp_write = tcp;

    // stdin -> tcp
    let writer = thread::spawn(move || -> Result<()> {
        let mut stdin = std::io::stdin();
        let mut buf = vec![0u8; 16 * 1024];
        loop {
            let n = match stdin.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            if tcp_write.write_all(&buf[..n]).is_err() { break; }
        }
        // Half-close TCP write so the peer sees EOF on its read half.
        let _ = tcp_write.shutdown(std::net::Shutdown::Write);
        Ok(())
    });

    // tcp -> stdout
    let reader = thread::spawn(move || -> Result<()> {
        let mut tcp_read = tcp_read;
        let mut stdout = std::io::stdout();
        let mut buf = vec![0u8; 16 * 1024];
        loop {
            let n = match tcp_read.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            if stdout.write_all(&buf[..n]).is_err() { break; }
            let _ = stdout.flush();
        }
        Ok(())
    });

    let _ = reader.join();
    let _ = writer.join();
    Ok(())
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
                // Skip non-response frames (events).
            }
            Message::Close(_) => bail!("daemon closed connection"),
            Message::Ping(p) => ws.send(Message::Pong(p))?,
            _ => {}
        }
    }
}
