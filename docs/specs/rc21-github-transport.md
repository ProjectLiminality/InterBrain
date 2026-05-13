# rc.21 — The Great Simplification (GitHub as transport)

Status: in progress (2026-05-13)
Branch: `feature/desktop-companion`
Target: ship rc.21 today

## What changed and why

The earlier path was WebRTC + a Cloudflare signaling Worker as a custom peer-to-peer transport. It worked end-to-end (clone, push, recursive submodule clone all validated Mac↔Windows on rc.20) but the full stack required NAT traversal, signaling correctness, ICE state-machine handling, and a custom `git-remote-interbrain` helper bridging git's pack-protocol to a WebRTC data channel — far more infrastructure than the InterBrain user base needs right now.

Pivoted to: **GitHub as the always-online transport, with InterBrain's own URL namespace (`interbrain://<uuid>`) layered on top so the conceptual model stays sovereign and transport-agnostic.**

The WebRTC implementation is preserved on `feature/webrtc-transport` for a future release once the user base grows beyond what GitHub will tolerate (or when philosophical commitment to true decentralization is honored in the product, not just the README).

## Architecture invariants

| Concept | Identifier | Lives in |
|---|---|---|
| Idea identity | UUID | `.udd.uuid`, forever |
| Peer identity | GitHub username | daemon `peer_registry`, `interbrain://` URL `?peer=` param |
| Submodule URLs | `interbrain://<uuid>` | `.gitmodules` (no peer hint — daemon resolves locally first, then via parent-repo-origin transitivity, then peer registry) |
| Peer remote URLs | `interbrain://<uuid>?peer=<user>/<repo>` | git config (remotes) |
| Actual transport URL (invisible plumbing) | `https://github.com/<user>/<repo>` | resolved by daemon `resolve-peer-url` IPC op |

**Plugin code never sees GitHub URLs.** The plugin operates on UUIDs and `interbrain://` URLs throughout. The `git-remote-interbrain` helper translates to GitHub HTTPS at the moment git invokes it, delegating actual pack-protocol transfer to git's native `git-remote-https`.

## Sovereignty model (the outbox pattern)

Each peer has three distinct things per DreamNode they collaborate on:

1. **Private local working copy** in their vault. Sovereign — they edit here.
2. **Their own GitHub repo for it** (e.g., `github.com/bob/square`). Their "outbox". Tracked as `origin`. `Share Changes` = push to origin.
3. **Knowledge of other peers' GitHub repos for the same DreamNode** (e.g., `github.com/alice/square`). Tracked as peer remotes (`interbrain://<uuid>?peer=alice/square`). Fetch-only, surfaces in the cherry-pick preview modal.

**The "official" version is YOUR version.** You decide what your Square is. If you don't like a commit Alice made, you don't accept it; your Square stays the way you want it.

## Clone-accept flow (the rename-origin dance)

Standard `git clone https://github.com/alice/square` would set Alice's repo as `origin` — meaning `git push` would try to write to Alice's repo (which Bob has no permission for, AND violates sovereignty).

Daemon orchestrates the actual flow on Invite-accept:

```
git clone https://github.com/alice/square ~/vault/Square
cd ~/vault/Square
git remote rename origin alice   # Alice is a peer, not origin
gh repo create bob/square --private --source=. --push
# now origin = bob/square (Bob's sovereign outbox)
# alice = alice/square (peer, fetch-only via cherry-pick)
```

Plugin registers DreamNode in UUID index after clone completes. Bob's local Square is now sovereign with Alice as a peer remote. Done.

## The two user-facing actions

**Share Changes** — on a DreamNode, push current commits to your own outbox:
- Ensure DreamNode has GitHub origin (auto-create via `gh repo create` if missing)
- `git push origin main`

**Invite Collaborators** — on a DreamNode, generate a share link:
- Copy `https://github.com/<me>/<repo>` to clipboard
- Friend pastes URL into "Clone DreamNode" dialog → triggers daemon's clone-accept flow above

## WebRTC → GitHub substitution table

| Operation | WebRTC version | GitHub version |
|---|---|---|
| Helper resolves URL | Daemon opens WebRTC channel via `open-peer-relay` IPC | Daemon returns GitHub HTTPS URL via `resolve-peer-url` IPC |
| Pack-protocol byte transfer | Custom relay over webrtc-rs data channel | Native `git remote-https`, delegated by our helper |
| Auth | ed25519 keypair signatures (never completed) | gh CLI token, set up by `gh auth login` |
| Discoverability | Cloudflare Worker computed room IDs | GitHub URLs in invite links |
| Always-online availability | Both peers must be online + reachable | GitHub is always online |
| NAT traversal | Cloudflare TURN | HTTPS through standard CDN — not needed |
| `peer_relay.rs`, `transport.rs`, `signaling.rs` | Wired and validated | Deleted (preserved on webrtc-transport branch) |

## Submodule resolution

`.gitmodules` stores `url = interbrain://<uuid>` (no peer hint). When git invokes the helper for a submodule:

1. **Local first** — daemon checks UUID index. If the submodule is already in any registered vault, serve from that local path. No network. Offline-friendly.
2. **Parent-repo-origin transitivity** — if local resolve fails, look at the parent repo's `origin` remote. If that's `interbrain://<parent-uuid>?peer=<alice>/<parent-repo>`, try resolving the submodule UUID against Alice's GitHub (`alice/<submodule-repo-name>`). Captures "submodules come from whoever served the supermodule".
3. **Peer registry iteration** — fall back to trying each registered peer.

This gives the right behavior without dragging Alice's identity into the `.gitmodules` file (which would couple submodule URLs to specific peers — wrong).

## Plugin layer (mostly unchanged)

The plugin uses UUIDs internally. Operates on git remotes via standard `git remote`, `git fetch`, `git cherry-pick`. Doesn't care about transport. The cherry-pick preview modal, coherence-beacon, holakey navigation, DreamSong canvas — all unchanged.

What changes in the plugin:
- **Dreamweaving service** writes `interbrain://<uuid>` submodule URLs (was: relative paths like `../<Name>`).
- **Radicle calls** (`rad init`, `rad publish`, `rad sync`, etc.) are replaced by gh CLI equivalents or daemon-orchestrated flows. Done incrementally per-call-site, not as one big delete.
- **Obsidian commands** that were Radicle-specific are either adapted to gh-CLI equivalents or deleted (if the underlying action only made sense in the Radicle network model).

## Daemon's new responsibilities

- **`resolve-peer-url` IPC op** — takes `{uuid, peer}` (peer = `<github-user>/<repo>`), returns `{url: https://github.com/<that>}`. Daemon doesn't actually do anything network-side; it just constructs the URL. The helper does the actual git-remote-https call.
- **Vault auto-registration with Obsidian** — write to `obsidian.json` on vault create so `obsidian://open?vault=<name>` works on first try.
- **`.gitmodules` migration** — one-shot rewrite of legacy relative-path URLs to `interbrain://<uuid>` on first scan that touches each vault.
- **Activity scanner** — walks all DreamNodes in all registered vaults, fetches each peer remote, counts commits ahead. Returns aggregate for the dashboard's Activity tab.
- **Peer registry** — `{github_username, name}` entries. `add-peer` / `list-peers` IPC ops already exist.

## Dashboard's new shape

Tabs: **Activity** (default) | **Settings**

**Activity tab**: "Scan for updates" button, last-scan timestamp, list of entries `{dreamnodeName, peerName, commitsAhead}`. Click entry → opens vault in Obsidian, plugin selects DreamNode by UUID and opens cherry-pick preview modal.

**Settings tab**: Vaults section moves here from its own tab. Then existing sections (GitHub auth, coding agent, AI provider, etc.).

Critical: the dashboard activity-scan and the plugin's per-DreamNode check-for-updates command share the **same cherry-pick preview modal**. Single code path, two entry points.

## Acceptance criteria — the demo

Validate end-to-end on Mac (Alice) + Windows (Bob). PNG dreamtalks already exist at `/Users/davidrug/InterBrainDemo/`.

1. Alice creates Square DreamNode with Square.png.
2. Alice clicks Share Changes → daemon creates `github.com/projectliminality/<shortname>` private repo, pushes.
3. Alice clicks Invite Collaborators → copies GitHub URL.
4. Bob (Windows) pastes URL into Clone DreamNode dialog → daemon does rename-origin dance, Square appears in Bob's vault.
5. Repeat for Circle.
6. Alice creates Cylinder, weaves Square + Circle submodules via canvas. `.gitmodules` contains `interbrain://<square-uuid>` and `interbrain://<circle-uuid>`.
7. Alice Share Changes → Cylinder on GitHub.
8. Alice Invite Collaborators for Cylinder.
9. Bob accepts → daemon clones Cylinder, recursive-clones submodules. Each submodule UUID resolves locally (Bob already has Square + Circle).
10. Bob commits small change to Cylinder. Share Changes → pushes to `bob/cylinder`.
11. Alice clicks Scan for updates in dashboard. Activity entry: "Cylinder: 1 commit from @bob".
12. Alice clicks entry → vault opens, cherry-pick modal shows Bob's commit.
13. Alice accepts → commit cherry-picked into her main.
14. Click a media file in DreamSong canvas — corresponding child DreamNode reveals in dreamspace (validates holakey navigation + UUID-based submodule reference).

All 14 pass → rc.21 ships.

## Known follow-ups (NOT blocking ship)

- **Private repos with auto-collaborator-add**: Q2 confirmed public-by-default for first ship. Migrate to private + `gh api ... collaborators` later.
- **Cloudflare TURN** + WebRTC re-enablement: deferred. Branch `feature/webrtc-transport` preserves all that work.
- **`#46` Windows DreamNode mount bug**: investigation pending. May or may not block ship depending on severity.
- **Friend-link** as a separate UX (just add someone to peer registry without sharing a DreamNode): not needed for first ship since invite-link already does both.

## Build process

`npm run build:daemon` runs `tauri build --no-bundle` for production-cfg builds. Plain `cargo build` produces dev-cfg binaries that load the dashboard from `localhost:1420` instead of the bundled `dist/` — root cause of the "blank tray window" issue we chased earlier. Always use the npm script.

## Compaction-resilient pointers

- Current uncommitted work in working tree: FirstRun GitHubIdentityStep + obsidian:// vault-name fix (commit before doing more).
- Task list in this session has tasks #46, #47, #56, #61, #65–#75 covering the full ship plan.
- WebRTC work preserved at `feature/webrtc-transport` (commits up to and including `21fb631`).
- Demo content + reset script at `/Users/davidrug/InterBrainDemo/`.
- Mac install at `/Applications/InterBrain.app/`. Windows install at `%LOCALAPPDATA%\InterBrain\`.
- SSH alias `win` for Windows iteration (David@192.168.1.96).
