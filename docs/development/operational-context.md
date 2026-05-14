# Operational Context — cross-platform development

The granular operational how-to for InterBrain development: the
Mac↔Windows SSH bridge, the Tauri build pipeline, Windows-specific
platform gotchas, and the file:line maps from the v0.16.0 GitHub-transport
pivot. **This is the deep reference — start at [CLAUDE.md](../../CLAUDE.md)
for the index, come here when you need the procedural detail.**

History: originally captured during the v0.16.0 "Great Simplification"
pivot (the rc.1–rc.23 iteration that replaced Radicle with GitHub as the
collaboration transport). The architectural why-and-what for that pivot
lives in [../specs/rc21-github-transport.md](../specs/rc21-github-transport.md);
the retired WebRTC prototype is preserved on the `feature/webrtc-transport`
branch. Section 5's rc-by-rc ledger is frozen as a historical record;
everything else (SSH bridge, build pipeline, Windows gotchas) is live and
maintained.

---

## 1. Windows SSH bridge

The Windows test laptop sits on the same Wi-Fi as the Mac dev box. Mac drives Bob (Windows) entirely via SSH; the only manual GUI step happens through Microsoft's "Windows App" (formerly Microsoft Remote Desktop) for first-run flows.

**Network facts**
- **Windows hostname:** `PC`
- **Windows username:** `David` (NB: `whoami` returns `pc/david`, but the login is `David` — the slash form is Windows domain notation, not the SSH user)
- **Windows IP:** `192.168.1.96` (same-subnet Wi-Fi; if cross-network, intend to use Tailscale per the original plan)
- **Mac SSH key (dedicated to this session):** `~/.ssh/id_ed25519_interbrain` (comment: `claude-code-mac-to-win`), generated with:
  ```bash
  ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519_interbrain -C "claude-code-mac-to-win"
  ```

**Mac-side `~/.ssh/config` alias** — the entire session uses `ssh win <cmd>`:
```
Host win
    HostName 192.168.1.96
    User David
    IdentityFile ~/.ssh/id_ed25519_interbrain
    IdentitiesOnly yes
    ServerAliveInterval 30
```
Then `chmod 600 ~/.ssh/config`.

**Windows-side OpenSSH setup (PowerShell as Administrator)**
1. `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0` (1–3 min; downloads from Windows Update; the spinner sits at `Running [oooooooooo`).
2. `Start-Service sshd` ; `Set-Service -Name sshd -StartupType 'Automatic'`.
3. Open firewall: `New-NetFirewallRule -Name "OpenSSH-Server-In-TCP" -DisplayName "OpenSSH Server (sshd)" -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow` (the script in transcript also probes with `Get-NetFirewallRule -DisplayName "OpenSSH Server (sshd)"`).

**Authorized-keys gotcha — administrator users on Windows**
The MSI installer makes the first Windows user an **administrator**. For admin accounts, `~/.ssh/authorized_keys` is ignored; the file sshd actually reads is `C:\ProgramData\ssh\administrators_authorized_keys`. The recovered script writes to whichever location matches and then locks down ACLs:

```powershell
$pubkey = '<paste pubkey from id_ed25519_interbrain.pub>'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")

if ($isAdmin) {
    $authFile = "$env:ProgramData\ssh\administrators_authorized_keys"
    if (!(Test-Path $authFile)) { New-Item -ItemType File -Path $authFile -Force | Out-Null }
    if ((Get-Content $authFile -ErrorAction SilentlyContinue) -notcontains $pubkey) {
        Add-Content -Path $authFile -Value $pubkey
    }
    icacls $authFile /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null
} else {
    $sshDir = "$env:USERPROFILE\.ssh"
    if (!(Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir | Out-Null }
    $authFile = "$sshDir\authorized_keys"
    if (!(Test-Path $authFile)) { New-Item -ItemType File -Path $authFile -Force | Out-Null }
    if ((Get-Content $authFile -ErrorAction SilentlyContinue) -notcontains $pubkey) {
        Add-Content -Path $authFile -Value $pubkey
    }
    icacls $authFile /inheritance:r /grant "$($env:USERNAME):F" | Out-Null
}
Restart-Service sshd
```

**Default shell tweak (PowerShell instead of cmd)** — not done. Every `ssh win <cmd>` invocation in the session wrapped commands as `ssh win 'powershell -c "..."'` rather than rely on a sticky default-shell setting. If you ever want SSH to land directly in PowerShell (purely a convenience):
```powershell
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force
```

**Working SSH invocations from the transcript**
```bash
# Smoke test
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -o BatchMode=yes david@192.168.1.96 'whoami'
# Or via alias:
ssh win 'echo "alias works"; whoami'

# Silent install of an InterBrain .exe (download + run /S)
ssh win 'Stop-Process -Name interbrain-desktop -Force -ErrorAction SilentlyContinue; Start-Sleep 2; $url = "https://github.com/ProjectLiminality/InterBrain/releases/download/v0.16.0-rc.X/InterBrain_0.16.0-rc.X_x64-setup.exe"; $tmp = "$env:TEMP\interbrain-setup.exe"; Invoke-WebRequest -Uri $url -OutFile $tmp; Start-Process -FilePath $tmp -ArgumentList "/S" -Wait'

# Inspect bundled plugin resources after install
ssh win 'Get-ChildItem "$env:LOCALAPPDATA\InterBrain\resources\plugin" | Select-Object Name, Length'

# Inspect Windows Credential Manager
ssh win 'cmdkey /list | Select-String "org.projectliminality.interbrain"'
```

**SSH limitation worth remembering**
SSH-launched processes run in a **network logon session**, not an interactive logon session. Two consequences seen repeatedly:
- WebView2 fails to initialize → daemon would crash on first-run window creation (the rc.18 `INTERBRAIN_HEADLESS=1` escape hatch was added precisely because of this).
- The Credential Manager GUI shows entries from interactive sessions; SSH-launched daemons can't enumerate them via `cmdkey /list` in the same way (the entries are scoped). The fix: write+readback verification inside the daemon, surfaced via structured logs, instead of relying on `cmdkey` from SSH.

---

## 2. Windows iteration loop

Local Rust/Cargo builds on the Windows test laptop fail with:
```
Caused by:
  An Application Control policy has blocked this file. (os error 4551)
warning: build failed, waiting for other jobs to finish...
```
This is Windows Defender Application Control (WDAC) blocking unsigned compiler/proc-macro binaries — affects only the iteration speed, not end users. Tracked as **issue #47** in the project board.

The working loop instead:

1. **Edit code on Mac** (`feature/desktop-companion` branch).
2. **Bump version in `desktop/src-tauri/Cargo.toml`** to the next `0.16.0-rc.X`.
3. **Commit + tag + push** in one shot:
   ```bash
   git commit -am "<message>"
   git tag v0.16.0-rc.X && git push origin feature/desktop-companion v0.16.0-rc.X 2>&1 | tail -5
   ```
4. **Wait for GitHub Actions matrix** (`.github/workflows/release.yml` — runs on `tag v*`). Matrix shape:
   - `macos-latest` → produces `InterBrain_0.16.0-rc.X_universal.dmg` + `InterBrain_universal.app.tar.gz` (universal apple-darwin, requires the helper binary `git-remote-interbrain` to also be built universal; see rc.13/rc.14 for the staging fix).
   - `ubuntu-22.04` → `.deb` + `.AppImage` (`InterBrain_0.16.0-rc.X_amd64.deb`, `InterBrain_0.16.0-rc.X_amd64.AppImage`).
   - `windows-latest` → NSIS `.exe` + WiX `.msi` (`InterBrain_0.16.0-rc.X_x64-setup.exe`, `InterBrain_0.16.0-rc.X_x64_en-US.msi`, plus `.sig`/`.zip`/`.zip.sig` for updater channel).

   Typical timings: macOS ~12–18 min (slowest, universal lipo), Linux/Windows ~6–8 min. CI total green at ~18–20 min.

5. **Background-watch the build**: `gh run watch <run-id>` ; the transcript leans on `gh release view v0.16.0-rc.X --repo ProjectLiminality/InterBrain --json assets -q '.assets[] | "<format>"'` for asset URLs.

6. **Install on Windows over SSH** (the canonical one-shot, see §1 for the wrapped command):
   ```bash
   ssh win 'Stop-Process -Name interbrain-desktop -Force -ErrorAction SilentlyContinue; \
            Start-Sleep 2; \
            $url = "https://github.com/ProjectLiminality/InterBrain/releases/download/v0.16.0-rc.X/InterBrain_0.16.0-rc.X_x64-setup.exe"; \
            $tmp = "$env:TEMP\interbrain-setup.exe"; \
            Invoke-WebRequest -Uri $url -OutFile $tmp; \
            Start-Process -FilePath $tmp -ArgumentList "/S" -Wait'
   ```
   NSIS supports `/S` for silent install — NSIS handles the in-place upgrade case fine (no need to uninstall first in rc-to-rc).

7. **Install on Mac**:
   ```bash
   curl -L -o /tmp/InterBrain-rcX.dmg \
     https://github.com/ProjectLiminality/InterBrain/releases/download/v0.16.0-rc.X/InterBrain_0.16.0-rc.X_universal.dmg
   hdiutil attach /tmp/InterBrain-rcX.dmg -nobrowse
   rm -rf /Applications/InterBrain.app
   cp -R /Volumes/InterBrain/InterBrain.app /Applications/
   hdiutil detach /Volumes/InterBrain
   ```

8. **Verify install over SSH**:
   ```bash
   ssh win 'Get-ChildItem "$env:LOCALAPPDATA\InterBrain\resources\plugin" | Select-Object Name, Length'
   ssh win 'Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue | Where-Object DisplayName -match InterBrain | Select DisplayName,DisplayVersion'
   ```

**winget?** The Mac→Win flow installs by direct download; **winget was not used for InterBrain installs**. The transcript proposes winget for *MSVC Build Tools* to enable local Windows Rust builds, but the user opted to keep using CI instead.

---

## 3. Windows-specific platform gotchas pile

A pile of discoveries from running on the bare Windows laptop. Compressed to one or two lines per gotcha.

### 3.1 CredWrite silence (no consent prompt unlike macOS Keychain)
**Discovery:** UI claimed "Keychain entry written" but the user found nothing visible in Windows Credential Manager via SSH (`cmdkey /list` from SSH returned empty).
**Reality:** Windows CredWrite is silent by design for same-user same-session writes — no consent dialog like macOS Keychain. Also, SSH = network logon session, so it cannot enumerate credentials stored by interactive sessions. The credential IS written, just not visible from where the user was looking.
**Fix:**
1. `keyring` crate features added: `apple-native`, `windows-native`, `sync-secret-service`. Without `apple-native`/`windows-native` flags, `set_password` silently no-ops.
2. Daemon now does **write + readback verification** inline and logs both events; structured log replaces SSH-based inspection.
3. UI copy updated to explain Windows behavior.
4. To eyeball entries on Windows, do it through the Windows GUI (Control Panel → User Accounts → Credential Manager → Windows Credentials) — look for targets containing `org.projectliminality.interbrain`.

### 3.2 Junctions vs symlinks for plugin install (issue #46 root cause)
**Discovery:** rc.10 dev-mode toggle wiped the plugin install on Windows. `std::os::windows::fs::symlink_dir` requires admin privileges OR Developer Mode enabled, and the user had neither. The call failed silently after the existing plugin dir had already been deleted, so the plugin dir was simply gone.
**Fix:** On Windows, `link_dir()` now shells out to `cmd /C mklink /J <dst> <src>` to create a **directory junction**, which works without admin or Developer Mode. Order also changed: only delete the existing plugin dir AFTER the new junction/symlink is successfully created (atomic).

### 3.3 Path separator bugs (issue #46 mount failure)
**Discovery:** DreamNodes scanned correctly into the daemon's `uuid_index` (19 instances across 2 vaults on startup, per logs) but didn't render in the plugin's liminal-web UI on Windows. Confirmed `.udd` data is intact (e.g., NassimHaramein's `.udd` has 11 UUIDs in `liminalWebRelationships`). The bug is downstream — in how the plugin resolves UUIDs to paths or interfaces with the daemon's index when paths are Windows-style.
**Status:** Identified as a UI/render bug; **not data corruption**. Pending investigation (~10 min after fresh install). Issue #46 in the project board.

### 3.4 `obsidian.json` registry location on Windows
**Path:** `%APPDATA%\obsidian\obsidian.json` (i.e., `C:\Users\<User>\AppData\Roaming\obsidian\obsidian.json`).
**On Mac:** `~/Library/Application Support/obsidian/obsidian.json`.
**On Linux:** `${XDG_CONFIG_HOME:-$HOME/.config}/obsidian/obsidian.json`.
**Implementation:** `desktop/src-tauri/src/vaults.rs::obsidian_registry_path()` — branches on `cfg!(target_os = ...)`. Reads `APPDATA` env var with fallback to `~/AppData/Roaming`.

### 3.5 Signing / notarization status
**macOS:** unsigned. Sequoia (15+) hides the right-click→Open workaround; users must go to System Settings → Privacy & Security → "Open Anyway" after the first blocked attempt. Apple Developer Program ($99/yr) was deferred.
**Windows:** unsigned NSIS `.exe`. SmartScreen flags it as "Windows protected your PC" — user clicks "More info" → "Run anyway." OV/EV certs deferred (note: since June 2023 all code-signing certs require hardware tokens, complicating CI).
**Linux:** AppImage, no signing infrastructure required.

### 3.6 PowerShell vs cmd vs WSL
Standardized on **PowerShell** for all daemon-spawned subprocesses on Windows. cmd is legacy batch syntax; WSL bash uses different filesystem semantics. The single-line shells-explainer the transcript settled on: "PowerShell, period."

---

## 4. Tauri build pipeline

### 4.1 The `tauri build --no-bundle` vs `cargo build` trap (blank dashboard root cause)
The pain: when you `cargo build --release` the daemon directly, the resulting binary points its WebView at `devUrl` (`http://localhost:1420`). When the dev server isn't running you get a **blank dashboard window**. The fix is to use `tauri build --no-bundle`, which switches the binary to point at `frontendDist` (`../dist`, the built React bundle).

This is encoded in `npm run build:daemon`:
- Calls `tauri build --no-bundle` (production cfg, no installer artifacts).
- Output: `desktop/src-tauri/target/release/interbrain-desktop` (the production-cfg binary) and `git-remote-interbrain` (the helper).
- This is the canonical local-iteration build for the Mac dev daemon. When the user wants to swap a fresh build into `/Applications/InterBrain.app/Contents/MacOS/`, this is what produces it.

The `desktop/src-tauri/tauri.conf.json` block that controls this:
```json
"build": {
  "beforeDevCommand": "npm run dev",
  "beforeBuildCommand": "npm run build",
  "devUrl": "http://localhost:1420",
  "frontendDist": "../dist"
}
```

### 4.2 Bundle targets per platform
From `desktop/src-tauri/tauri.conf.json`:
```json
"bundle": {
  "targets": ["dmg", "app", "nsis", "deb", "appimage", "updater"]
}
```
- **macOS:** `.app` (bundle directory) + `.dmg` (canonical download) + `.app.tar.gz` (for the updater channel). Universal builds via lipo of both arm64 and x86_64; **both** the primary binary (`interbrain-desktop`) AND the sidecar (`git-remote-interbrain`) must be built universal or the bundle step fails (this is what blocked rc.10/11/12 on macOS CI — see §5 ledger).
- **Windows:** NSIS `.exe` (default for non-technical users, supports per-user installs without admin) + WiX `.msi` (enterprise/Group Policy path). Both ship; `.exe` is what the iteration loop uses.
- **Linux:** `.deb` + `.AppImage` (AppImage is the universal single-executable path).

### 4.3 Plugin payload bundled as Tauri resources
The Obsidian plugin (built into `main.js`, `manifest.json`, `styles.css`, plus `theme/interbrain.css`) is bundled into the Tauri app via the resources mechanism. On install, the daemon copies these files into the user's chosen vault under `<vault>/.obsidian/plugins/InterBrain/` (managed mode) or symlinks/junctions them to a dev clone (dev mode).
- **Resource resolution at runtime:** `AppState::new()` in `desktop/src-tauri/src/commands.rs` uses `handle.path().resource_dir()?.join("plugin")` in production; in dev it navigates up from `desktop/src-tauri` until it finds `manifest.json` at the repo root.
- **The macOS CI gotcha (rc.13):** Tauri's `build.rs` expects plugin resources to be staged BEFORE the universal helper-binary build. rc.13 failed because the staging happened too late. rc.13's fix (commit `ae3cc29`) was the workflow step "macOS CI: stage plugin resources before universal helper build."

### 4.4 GitHub Actions release workflow
- **File:** `.github/workflows/release.yml`
- **Trigger:** `on: push: tags: v*` (any tag starting with `v`, including `v0.16.0-rc.X`).
- **Matrix:** `[macos-latest, ubuntu-22.04, windows-latest]`.
- **Action used:** `tauri-apps/tauri-action`.
- **Permissions:** `contents: write` (required to upload assets to a release; otherwise the assets sit behind collab auth).
- **Release config:** `prerelease: true, releaseDraft: false` — assets are public immediately; `releaseDraft: true` was rejected because it hides assets behind repo-collab auth.
- **Tauri updater:** plugin requires a valid pubkey at build time — **currently disabled** (rc.21 ships without auto-updater); pubkey placeholder lives in `tauri.conf.json` plugins.updater.

---

## 5. rc.1 through rc.20 iteration ledger

Chronological mapping of each release tag to what it fixed. Order is by tag, not by clock (most of yesterday's testing collapsed rc.13→rc.20 into a single afternoon).

| Tag | What got fixed |
|---|---|
| **rc.1** | First Tauri release. Single-instance plugin, tray-icon anchor positioning, macOS-private-api flag, `keyring` 3.x with `apple-native`/`windows-native` features (without flags `set_password` silently no-ops), diceware-style passphrase generation, real `rad node start` validation (replacing the no-op `rad self --did` test), back/forward arrows in first-run, eye-icon API key inputs. First CI build for Windows install testing. |
| **rc.2** | First clean Windows installer run; clean test against an empty install dir after wiping rc.1 daemon state. |
| **rc.3** | (no distinct discovery in transcript — likely a roll-up bump) |
| **rc.4** | First-run identity flow polish (auto-passphrase, Keychain-consent UX, custom-passphrase + no-Keychain options); install checklist UI. Tauri version pin (`tauri-plugin-shell = "2.0.0-rc.4"` candidate noted in the dependency resolution error). |
| **rc.5** | (no distinct discovery in transcript) |
| **rc.6** | (no distinct discovery in transcript) |
| **rc.7** | Static first-run window (revert of an rc.7 target-specific Cargo block per the recent commit log). |
| **rc.8** | (no distinct discovery in transcript) |
| **rc.9** | (no distinct discovery in transcript) |
| **rc.10** | **Four fixes in one ship:** (1) First-run window auto-opens on launch (defer-hook now catches no-identity case); (2) Tray dashboard closes on focus-lost via `WindowEvent::Focused(false) → hide()`; (3) **Plugin payload bundled as Tauri resources** — fixes "bundled plugin missing" on production installs (`main.js`, `manifest.json`, `styles.css`); (4) Keychain UI copy updated to explain silent Windows CredWrite. Also: dev-mode toggle was wiping plugin install because Windows symlink_dir requires admin — replaced with `cmd /C mklink /J` junction. |
| **rc.11** | Theme bundled (`interbrain.css` now included in resources, 6252 bytes); InterBrain repo cloned into vault by default (no need to toggle dev mode); theme applies in BOTH dark and light Obsidian modes (previously `.theme-dark { ... }` selector only; Windows fresh install defaults to light inherited from OS). |
| **rc.12** | Stable Windows install validated end-to-end: theme works in light mode, no terminal flashes, vault auto-opens, dev-mode disabled on Windows. This is the rc the user blessed as "shipping clean." |
| **rc.13** | macOS CI failure: Tauri's `build.rs` tried to bundle universal-apple-darwin but the helper `git-remote-interbrain` wasn't staged before the lipo build → `Failed to copy binary from .../target/universal-apple-darwin/release/git-remote-interbrain`. Fix: add a "Stage plugin resources for Tauri" step BEFORE the universal helper build. (rc.10/11/12 had the same latent failure but on different commits.) WebRTC IPC wiring + URL format changes also landed here. |
| **rc.14** | macOS CI now passes; universal `.dmg`, x64 `.exe`, `.deb` + `.AppImage` all uploaded. Installed on Mac (PID 89123 in `/Applications/InterBrain.app/Contents/MacOS/interbrain-desktop`) and Windows. |
| **rc.15** | WebRTC handshake fix: signaling pump's `clear_blobs` was deleting peer blobs before the peer read them → handshake never completed. Renamed: "Fix WebRTC handshake: stop self-clearing signaling blobs" (commit `b06544c`). |
| **rc.16** | Stale-blob storms: old offers/answers/ICE from prior failed attempts triggered runaway `accept_inbound` (Bob's daemon firing ~10 times in 20s). Fix: session-window filter + back-off, `peer_has_pending_offer` only matches `"<correct_state>"` (commit `67da5b9` "Fix inbound listener storms on stale signaling blobs"). |
| **rc.17** | Added IPC op `generate-fresh-identity` for **headless first-run** — needed because the WebView2 failure crashes the entire daemon on SSH-launch, taking the IPC server with it. With this op, identity can be provisioned in-process from a bash script via SSH (commit `a46e73b`). |
| **rc.18** | Added `INTERBRAIN_HEADLESS=1` env var. When set, the daemon skips opening the first-run window even when no identity exists. IPC stays up, headless identity creation now works (commit `c2fdb96`). This made the Windows test loop fully autonomous. |
| **rc.19** | mDNS host-candidate obfuscation disabled in webrtc SettingEngine (`MulticastDnsMode::Disabled`) — forces real local-IP candidates so ICE can connect directly when peers share a network. Also extended listener back-off (commit `76088db`). Locally: offerer-never-receives-SDP-answer + ICE candidate buffering before remote-desc applied (commit `b1e244b`). Per-peer offer-seq tracking to avoid re-accepting stale offers (commit `fd4d2c8`). Local Windows cargo build attempted, failed with `os error 4551` Application Control → fell back to CI. |
| **rc.20** | **Validated**: Mac↔Windows clone via `interbrain://` URL succeeded over same-Wi-Fi WebRTC data channel. Final fix: install `on_message` before data channel opens (otherwise the first frame was dropped) — commit `2a28b9f`. Tag `f81adfe`. Carries cumulative fixes from rc.15–19. **End-to-end transport validation green.** |
| **rc.21** | (in progress) The Great Simplification — WebRTC stripped (commit `712ef5c`), `git-remote-interbrain` helper repurposed for GitHub backend (`7450c8a`), peer registry now uses GitHub usernames, first-run uses gh device-flow. See `rc21-github-transport.md`. |

---

## 6. URL-handler vault-by-name quirk + obsidian.json auto-registration

### 6.1 The discovery
Clicking the "Open Vault" button in the dashboard did **nothing**. The daemon was calling:
```rust
let url = format!("obsidian://open?path={}", urlencoding::encode(&vault_path));
```
Per Obsidian's documented URL handler, `obsidian://open` resolves vaults by **name**, not path. `path=` is a *different* parameter, used to open a specific note inside an already-known vault. With `path=` and no `vault=`, Obsidian silently does nothing.

### 6.2 The fix
**File:** `desktop/src-tauri/src/commands.rs` — the `open_vault_in_obsidian` command.
**Before:**
```rust
#[tauri::command]
pub fn open_vault_in_obsidian(vault_path: String) -> Result<(), String> {
    let url = format!("obsidian://open?path={}", urlencoding::encode(&vault_path));
    crate::open_external(&url).map_err(|e| e.to_string())
}
```
**After (uncommitted at compaction):**
```rust
#[tauri::command]
pub fn open_vault_in_obsidian(vault_path: String) -> Result<(), String> {
    // Obsidian's URL handler resolves vaults by NAME, not path. Vault name
    // = basename of the path. The vault must already be registered with
    // Obsidian (which create_vault / install_plugin_into_vault arranges).
    let vault_name = std::path::Path::new(&vault_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("invalid vault path: {vault_path}"))?;
    let url = format!("obsidian://open?vault={}", urlencoding::encode(vault_name));
    crate::open_external(&url).map_err(|e| e.to_string())
}
```
**Two call sites were wrong** — both `commands.rs` and `lib.rs` (per the assistant's "Two spots, both wrong" finding). Both fixed identically.

### 6.3 Auto-register vault in `obsidian.json` on create-new-vault
For `obsidian://open?vault=<name>` to work, the vault must already be in Obsidian's registry. The daemon's create-new-vault flow now writes the entry directly into `obsidian.json` (per-platform path, see §3.4) instead of relying on Obsidian to pick it up later.

**Verified shape of `obsidian.json`** (cat'd from `~/Library/Application Support/obsidian/obsidian.json` 2026-05-13):
```json
{"vaults":{"df233edc8c3f768f":{"path":"/Users/davidrug/DreamVault","ts":1778664594720,"open":true},"5c9337e4de5bb5c9":{"path":"/Users/davidrug/InterBrainDemo/DemoVault","ts":1777667042003}, ...}}
```
Key facts:
- **Single top-level key `vaults`**. No `app.json` marker at this level — the briefing's earlier wording conflated two different things.
- **16-char lowercase hex ID** per vault. Daemon generates randomly on create.
- Per-vault fields: `path` (absolute), `ts` (epoch millis, last-opened), optional `open: true` flags the currently-open vault.
- **Idempotent**: if path already exists under any key, no new entry. Daemon reads, deserializes preserving unknown keys, mutates, writes back atomically.

**`app.json` is a separate, vault-local file**: `<vault>/.obsidian/app.json`. Obsidian writes it to mark a directory as a real vault (contents often just `{}`). Daemon's `create_vault` / `install_managed` write this marker so Obsidian recognizes the vault on first open. Two distinct files, both load-bearing, easy to confuse.

Implementation lives in `desktop/src-tauri/src/vaults.rs` (functions `obsidian_registry_path()`, `discover_obsidian_vaults()`, plus the register-on-create helper).

---

## 7. Incremental Radicle strip — file:line replacement map

The plugin still has Radicle call-sites scattered through `src/features/social-resonance-filter/` and a handful of dependent features. **Line numbers below verified against the working tree on 2026-05-13** (the transcript's original "~100/~110" approximations were off by 50+ lines; corrected here).

**`src/features/social-resonance-filter/services/radicle-service.ts`** — primary surface area, ~1500 lines:

| Line | Symbol | Radicle call | gh-CLI / daemon replacement | Notes |
|---|---|---|---|---|
| 196 | `isAvailable()` | Detect rad binary | **Hardcoded `false`** already — all rad calls below are inert no-ops | Comment at 199: "Radicle integration retired in v0.16; WebRTC replaces it" (now: GitHub replaces WebRTC). Means most of this file is dead code that can be deleted, not migrated. |
| 307–341 | `rad init` block | Create Radicle project | `gh repo create <user>/<name> --private --source=. --push` (already implemented in `SovereigntyService.createOutbox`) | Delete this whole block. |
| 410, 448, 484, 578 | guards before various ops | `if (!await isAvailable()) return …` | Delete the entire functions these guard | Many of these are zombie code paths since isAvailable is hardcoded false. |
| 767 | `share()` | `rad sync` / `rad push` | `git push origin <branch>` (already in `SovereigntyService.shareChanges`) | Delete. |
| 1370 | `addPeerRemote(dreamNodePath, peerName, _radicleId, peerDID)` | Set up a Radicle peer remote | `git remote add <peer> https://github.com/<peer>/<repo>`; URL form `interbrain://<uuid>?peer=<owner>/<repo>` accepted by helper | The semantic ("track peer as fetch-only remote") is exactly what `SovereigntyService.ensureOwnOutbox`'s rename branch does. |
| 1468 | `reconcileRemotes()` | Walk submodules, reconcile rad peer remotes with registry | Walk `.gitmodules` + each repo's remotes; ensure peer remotes match daemon's peer registry; remove dead ones | Daemon now owns peer registry as source of truth. |

**`src/features/social-resonance-filter/services/peer-sync-service.ts`** — many references throughout:

| Line | Reference | Migration |
|---|---|---|
| 32 | `radicleId?: string` field in PeerSyncResult | Remove field; use UUID + GitHub username instead |
| 68, 71–72 | `private radicleService: RadicleService` | Remove dependency; inject SovereigntyService instead |
| 152 | `radicleId: node.udd.radicleId` | Drop |
| 216, 221 | `if (!data.radicleId) continue` / `getSeeders` | Replace seeder discovery with peer-registry iteration |
| 309–361 | dense block: `getRadicleId`, `share`, `followPeer`, `addDelegate`, `setSeedingScope` | All inert (isAvailable=false). Most likely the whole function is dead — re-derive in pure-GitHub terms |
| 386 | `getRadicleId(repoPath, passphrase)` | Drop |

**`src/features/coherence-beacon/service.ts`** — beacon commits reference `radicleId`:

| Line | Reference | Migration |
|---|---|---|
| 20 | `import { RadicleService }` | Drop |
| 35, 48 | `radicleId: string` in beacon types | Replace with `parentUuid` / `peerOwner` |
| 69 | `private _radicleService: RadicleService` ctor param | Drop |
| 156, 251 | Beacon commits emit `radicleId` JSON | Update to UUID-based schema |
| 183 | Commit-message parser scans for `COHERENCE_BEACON: {"type":"supermodule","radicleId":"..."}` | Update regex/JSON parser |
| 194 | `uriHandler.cloneFromRadicle(beacon.radicleId, false)` | Switch to `cloneFromGitHub` path |
| 203 | UI string `Radicle ID: ${beacon.radicleId}` | Update copy |
| 279 | `const parentRadicleId = parentUDD.radicleId` | Use `parentUDD.uuid` |

**`src/features/uri-handler/uri-handler-service.ts`** (related, called by coherence-beacon) — `cloneFromRadicle` at line 539. **Already in §B1–B3 of the rc21 dry-run report**; the Bob-side clone-accept path needs B1 (helper on PATH), B2 (recursive submodule init), B3 (drop stale githubRepoUrl write) fixes before it's demo-ready.

**Patterns to delete entirely (no replacement):**
- `passphraseManager` and `PassphraseManager` import/wiring — Radicle passphrase concept gone. Already removed from settings tab; remove the remaining call-sites.
- Anywhere starting / stopping `rad node` — daemon does not manage a node process anymore.
- The Radicle install path in `install.sh` (Tauri daemon's first-run flow has replaced the whole shell installer).
- `DiscoveredIdentity`, `FreshIdentityResult`, `IdentityChoice` types — see §9.

**Sanity check before editing:** every `radicleService.X()` call site is inert because `isAvailable()` is hardcoded `false`. So the strip is mostly *deletion* (dead code), not *migration*. The only places that need real replacement are: coherence-beacon's commit format, the URI handler's `cloneFromRadicle` (which is the Bob-side clone-accept and DOES still get exercised when senderDid is set in the clone link), and any UI copy that says "Radicle".

---

## 8. Submodule URL migration — `interbrain://<uuid>` mechanics

### 8.1 The conceptual layer
The submodule URL scheme is the project's **owned namespace** — it survives the WebRTC→GitHub transport swap unchanged:
- **Plain `interbrain://<uuid>`** — daemon resolves to a peer (no explicit hint; uses parent repo's origin first, then iterates peer registry).
- **`interbrain://<uuid>?peer=<github-user>/<repo>`** — explicit hint, used in invite links.
- Daemon turns either form into `https://github.com/<user>/<repo>` and delegates to git's native `git-remote-https` for byte transfer.

### 8.2 Dreamweaving submodule writer change
**Before:** `.gitmodules` entries written as relative paths:
```
[submodule "Square"]
    path = Square
    url = ../Square
```
**After:** `.gitmodules` entries written as `interbrain://<uuid>`:
```
[submodule "Square"]
    path = Square
    url = interbrain://550e8400-e29b-41d4-a716-446655440000
```

**File location of the writer (verified 2026-05-13):** `src/features/dreamweaving/services/submodule-manager-service.ts:173`. The `git submodule add` invocation at line 177 takes `submoduleUrl = interbrain://${childUuid}` from line 173.

**Status: ✅ done** (task #71 completed). The change is in the working tree as of commit `7063f3a`.

### 8.3 One-time daemon-startup migration
The migration walks every registered vault on daemon startup and rewrites existing `.gitmodules` files in-place.
- **Walks:** every DreamNode in every registered vault (`<vault>/<dreamnode>/`).
- **For each child submodule:** reads `<vault>/<dreamnode>/<child>/.udd` → extracts the child's `uuid` → rewrites the parent `.gitmodules`' `url = ../<Name>` to `url = interbrain://<uuid>`.
- **Commits to the parent repo:** one commit per migrated repo, message something like `migrate: .gitmodules to interbrain:// URL scheme`. Author identity uses daemon's git author config (or generic "InterBrain daemon").
- **Idempotency:** before writing, daemon checks the existing URL — if it already starts with `interbrain://`, skip. If the child has no `.udd` (not a DreamNode), skip. Safe to re-run.

**File location of the migrator (verified 2026-05-13):** `desktop/src-tauri/src/vaults.rs:474` — `pub fn migrate_legacy_gitmodules(vault_path: &Path) -> Result<usize>`. Called from the startup loop in `lib.rs` for each registered vault.

**Status: ✅ done** (task #72 completed, commit `7063f3a`).

### 8.4 Helper resolution flow
1. Git invokes the `git-remote-interbrain` binary (registered at `~/.config/git/config` or via PATH after install).
2. Helper parses `interbrain://<uuid>[?peer=<user>/<repo>]`.
3. Helper queries the daemon's IPC port: `resolve-peer-url` op.
4. Daemon returns either `https://github.com/<user>/<repo>` (when peer hint or inheritance succeeds) or `https://github.com/<user>/<repo>` from peer-registry iteration; OR error if no peer has it.
5. Helper delegates the rest to `git-remote-https`.

**Status of helper:** restored from the WebRTC branch in commit `7450c8a`, repurposed for GitHub backend. Commit `da437d2`: "Helper: fall back to daemon peer registry when URL has no peer hints."

---

## 9. First-run identity migration — ed25519 → gh device-flow

### 9.1 What got replaced in `desktop/ui/FirstRun.tsx`
- **Old:** `IdentityStep` — detected existing Radicle identity at `~/.radicle/keys/`, validated passphrase via `rad node start` with `RAD_PASSPHRASE` env, stored ed25519 keypair-decryption-passphrase in OS Keychain. Generated fresh `did:key` keypair if none found.
- **New:** `GitHubIdentityStep` — calls `gh_status` to check if `gh` CLI is installed + authenticated. If not authenticated, calls `gh_begin_sign_in` → shows device code in the UI + auto-copies it to the clipboard + opens `https://github.com/login/device` in the browser. Then `gh_complete_sign_in(device_code, interval)` polls in the background until the user completes the device flow. Result: `gh` CLI is now logged in to the user's GitHub account; daemon caches the username as the user's "peer identity."

### 9.2 New IPC ops (added to `desktop/src-tauri/src/commands.rs`)
```rust
#[tauri::command]
pub fn gh_status() -> crate::github::GhStatus { ... }

#[tauri::command]
pub async fn gh_begin_sign_in() -> Result<crate::github::DeviceFlowStart, String> {
    crate::github::begin_device_flow().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn gh_complete_sign_in(
    device_code: String,
    interval: u64,
) -> Result<String, String> {
    crate::github::complete_device_flow(device_code, interval)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn gh_sign_out() -> Result<(), String> {
    crate::github::gh_sign_out().map_err(|e| e.to_string())
}
```

### 9.3 Implementation in `desktop/src-tauri/src/github.rs`
- Uses `gh` CLI's published OAuth client ID: `const GH_CLIENT_ID: &str = "178c6fc778ccc68e1d6a";` (same one `gh auth login` uses).
- Scopes: `repo gist read:org workflow`.
- Endpoints: `https://github.com/login/device/code`, `https://github.com/login/oauth/access_token`.
- `begin_device_flow()` POSTs to the device-code endpoint, parses `{ device_code, user_code, verification_uri, interval, expires_in }`, **opens the browser** at `verification_uri` automatically (`crate::open_external(&body.verification_uri)`), returns the data to UI.
- The auto-copy-to-clipboard for the device code happens in the **React UI side** (via `@tauri-apps/plugin-clipboard-manager`'s `writeText(user_code)`); the daemon side just returns the code.
- `complete_device_flow(device_code, interval)` polls the access-token endpoint, then writes the result via `gh auth login --with-token` so the existing publishing code paths (which shell out to `gh`) keep working unchanged. Returns the GitHub username.

### 9.4 Types deleted from `desktop/src-tauri/src/identity.rs`
- `DiscoveredIdentity { source: 'radicle' | 'fresh', did, alias }` — gone (no more Radicle vs fresh).
- `FreshIdentityResult { identity, passphrase, stored_in_keychain }` — gone (no fresh ed25519 keypair to return).
- `IdentityChoice` enum (auto-passphrase / custom-passphrase / no-Keychain branching) — gone.
- The `IdentityManager` struct itself is greatly simplified or removed entirely; identity is now "whoever `gh` is logged in as."

### 9.5 Uncommitted at compaction
Per the captured `git status`:
```
M desktop/src-tauri/src/commands.rs
M desktop/src-tauri/src/lib.rs
M desktop/ui/FirstRun.tsx
M desktop/ui/styles.css
```
- `commands.rs` + `lib.rs`: `obsidian://open?path=` → `obsidian://open?vault=<name>` fix (§6 above).
- `FirstRun.tsx` + `styles.css`: the GitHubIdentityStep + device-code UX + styling.

These four files contain the entire delta between rc.20 and the current state. Once committed, the next rc tag (rc.21) is ready to push.

---

## 10. Tray UX gotchas

### 10.1 Blur-hide behavior
Tray popover closes when user clicks outside. Wired via Tauri's `on_window_event`:
```rust
// In desktop/src-tauri/src/windows.rs, attached to the tray window builder:
.on_window_event(move |event| {
    if let WindowEvent::Focused(false) = event {
        // hide() the tray window
        ...
    }
})
```
Added in rc.10 alongside three other fixes. The tray window is created in two places (`toggle_tray_window_at` and `toggle_tray_window`); a helper attaches the blur handler to both call sites.

### 10.2 First-run window auto-open + the rc.10 defer-hook fix
**Symptom:** Production-installed daemon didn't open the first-run window on first launch — the defer hook fired before the no-identity check could schedule it.
**Fix (rc.10):** Restructured the launch flow so the no-identity check runs in the setup hook *after* the tray icon and IPC server are up, and only then defers the first-run window creation. Also bundled side effects: window now opens centered on first launch (subsequent launches restore identity silently from Keychain — historic Radicle behavior; under the new gh-device-flow, it's "gh CLI already authenticated → silent" instead).

### 10.3 Dashboard incremental-build lesson
Mid-session the user attempted a "big rewrite" of the dashboard React tree. Result: **blank dashboard**. The lesson recorded in the transcript: rebuild the dashboard *incrementally*. The current dashboard (validated in rc.12 stable, then again at commit `f3c3b35`) is the load-bearing baseline — every new feature is a delta on top, not a from-scratch rewrite. Same lesson applies to the upcoming Activity tab redesign.

### 10.4 Upcoming `[Activity | Settings]` tabs (task #61)
The dashboard currently shows Vaults as the primary tab. The redesign:
- **Activity tab** becomes the default view (replaces Vaults-first).
  - Manual "Scan now" button → daemon walks every DreamNode in every vault, fetches from each peer remote (`git fetch <remote>` over HTTPS), counts new commits.
  - Each entry: e.g., "Square: 3 new commits from @alice" → click → opens vault + selects DreamNode in plugin → shows cherry-pick preview modal.
- **Settings tab** absorbs the existing Vaults list as a section.

**Tracking:** task #61 in the project board. Daemon-side `activity.rs` scanner was written for the WebRTC build and preserved on `feature/webrtc-transport`; needs to be ported back, simplified for GitHub (no relay, just `git fetch`), and the dashboard UI built. Estimated ~1–2 hours for UI + ~30 min for scanner port. Non-blocking for rc.21 ship; targeted for the next round.

---
