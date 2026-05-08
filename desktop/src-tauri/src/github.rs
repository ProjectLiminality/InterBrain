//! GitHub auth integration for the daemon.
//!
//! Owns the user-facing auth state and the OAuth device flow. Browser-only
//! UX — never opens a terminal. Tokens are written into `gh`'s config via
//! `gh auth login --with-token` so the existing publishing code path
//! (which shells out to `gh`) keeps working unchanged.

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::vaults::suppress_console_window;

/// gh CLI's published OAuth client ID. Same one `gh auth login` uses.
const GH_CLIENT_ID: &str = "178c6fc778ccc68e1d6a";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
/// Scopes match what the plugin's publishing code paths need.
const SCOPES: &str = "repo gist read:org workflow";

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GhStatus {
    pub installed: bool,
    pub authenticated: bool,
    pub username: Option<String>,
    pub version: Option<String>,
}

pub fn gh_status() -> GhStatus {
    let version = gh_version();
    let installed = version.is_some();
    if !installed {
        return GhStatus { installed: false, authenticated: false, username: None, version: None };
    }
    let username = gh_username();
    GhStatus { installed: true, authenticated: username.is_some(), username, version }
}

fn gh_version() -> Option<String> {
    let mut cmd = Command::new("gh");
    cmd.arg("--version");
    suppress_console_window(&mut cmd);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(2))
        .map(|s| s.to_string())
}

fn gh_username() -> Option<String> {
    let mut cmd = Command::new("gh");
    cmd.arg("api").arg("user").arg("--jq").arg(".login");
    suppress_console_window(&mut cmd);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() { None } else { Some(name) }
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: u64,
    expires_in: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFlowStart {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    pub device_code: String,
}

#[derive(Debug, Deserialize)]
struct AccessTokenResponse {
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    error: Option<String>,
}

/// Step 1: ask GitHub for a device code, copy `user_code` to clipboard,
/// open the browser at `verification_uri`. Returns the device code and
/// metadata so the UI can show the code (and the daemon can poll).
pub async fn begin_device_flow() -> Result<DeviceFlowStart> {
    let client = reqwest::Client::new();
    let resp = client
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .form(&[("client_id", GH_CLIENT_ID), ("scope", SCOPES)])
        .send()
        .await
        .context("device code request")?;
    if !resp.status().is_success() {
        bail!("device code request failed: {}", resp.status());
    }
    let body: DeviceCodeResponse = resp.json().await.context("device code parse")?;

    // Open the verification URL so the user just has to paste their code.
    let _ = crate::open_external(&body.verification_uri);

    Ok(DeviceFlowStart {
        user_code: body.user_code,
        verification_uri: body.verification_uri,
        expires_in: body.expires_in,
        interval: body.interval,
        device_code: body.device_code,
    })
}

/// Step 2: poll the access-token endpoint until the user completes the
/// browser flow. Stores the resulting token via `gh auth login --with-token`.
/// Returns the username on success.
pub async fn complete_device_flow(device_code: String, interval: u64) -> Result<String> {
    let client = reqwest::Client::new();
    // Cap polling at ~10 minutes — GitHub's device codes expire in 15.
    let max_attempts = (10 * 60 / interval.max(1)) as u32 + 5;
    let mut wait = Duration::from_secs(interval.max(5));

    for _ in 0..max_attempts {
        tokio::time::sleep(wait).await;
        let resp = client
            .post(ACCESS_TOKEN_URL)
            .header("Accept", "application/json")
            .form(&[
                ("client_id", GH_CLIENT_ID),
                ("device_code", device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .context("access token poll")?;
        let body: AccessTokenResponse = resp.json().await.context("access token parse")?;

        if let Some(token) = body.access_token {
            store_token_in_gh(&token).context("store token in gh")?;
            // Refresh the active user so subsequent gh calls hit the new account.
            return gh_username().ok_or_else(|| anyhow!("token stored but gh user lookup failed"));
        }
        match body.error.as_deref() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                wait += Duration::from_secs(5);
                continue;
            }
            Some("expired_token") => bail!("device code expired — please try again"),
            Some("access_denied") => bail!("authorization denied"),
            Some(other) => bail!("github oauth error: {}", other),
            None => bail!("unexpected empty oauth response"),
        }
    }
    bail!("authorization timed out");
}

/// Pipe a token into `gh auth login --with-token` so the existing
/// publishing code paths (which call `gh` directly) pick it up.
fn store_token_in_gh(token: &str) -> Result<()> {
    let mut cmd = Command::new("gh");
    cmd.arg("auth")
        .arg("login")
        .arg("--hostname")
        .arg("github.com")
        .arg("--with-token")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    suppress_console_window(&mut cmd);
    let mut child = cmd.spawn().context("spawn gh auth login")?;
    {
        let stdin = child.stdin.as_mut().ok_or_else(|| anyhow!("no stdin"))?;
        stdin.write_all(token.as_bytes())?;
        stdin.write_all(b"\n")?;
    }
    let output = child.wait_with_output().context("wait gh auth login")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("gh auth login --with-token failed: {}", stderr.trim());
    }
    Ok(())
}

/// Sign out non-interactively. With `--user` provided, gh skips the prompt.
pub fn gh_sign_out() -> Result<()> {
    let username = gh_username().ok_or_else(|| anyhow!("not signed in"))?;
    let mut cmd = Command::new("gh");
    cmd.arg("auth")
        .arg("logout")
        .arg("--hostname")
        .arg("github.com")
        .arg("--user")
        .arg(&username);
    suppress_console_window(&mut cmd);
    let output = cmd.output().context("gh auth logout")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("gh auth logout failed: {}", stderr.trim());
    }
    Ok(())
}
