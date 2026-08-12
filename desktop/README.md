# InterBrain Desktop (the daemon)

The Tauri system-tray companion app. The plugin (repo root `src/`) is the
experience; the daemon is the **background magic**: it owns everything that
should not live inside Obsidian.

## Responsibilities

- **First-run setup** — guided flow: GitHub sign-in (gh device flow),
  vault selection/creation, plugin installation.
- **Vault registry + plugin management** — managed vaults get their plugin
  payload installed/healed from the bundled resources; dev-mode vaults are
  symlinked/junctioned to the InterBrain clone and built via npm.
- **`git-remote-interbrain` helper + UUID index** — resolves
  `interbrain://<uuid>` submodule URLs: local instance first, then
  parent-origin transitivity, then peer registry.
- **GitHub identity** — via the `gh` CLI; the daemon never stores tokens.
- **Activity scanner** (`src-tauri/src/activity.rs`, #393) — periodic walk
  of every registered vault: fetches peer remotes (classified by declared
  URL owner), counts pending commits minus collaboration-memory decisions
  (inbox), and unpushed commits vs origin (outbox). Results cached for the
  dashboard; tray badge on incoming activity.
- **Dashboard** (`ui/TrayDashboard.tsx`) — a true macOS menu-bar popover
  (Accessory activation policy, popup window level). Tabs:
  **Vaults** (list + "+ Add vault" picker) · **Activity** (overview +
  deep links into Obsidian via `obsidian://interbrain-activity`) ·
  **Settings** (API keys, models, agent command).
- **IPC bridge** — local WebSocket server; the plugin discovers the port
  from the daemon's config dir. Events: `settings-changed`,
  `activity-updated`.

## Build

- Local iteration: `npm run build:daemon` (never plain `cargo build` —
  that bakes in devUrl and ships a blank dashboard).
- Releases: `vX.Y.Z` tags trigger the 3-OS Release CI matrix
  (see `.github/workflows/release.yml` and
  `docs/development/operational-context.md`).

## Related docs

- Architecture of the GitHub-transport model:
  `docs/specs/rc21-github-transport.md`
- Cross-platform dev mechanics: `docs/development/operational-context.md`
- Update strategy (planned): issue #410 — plugin = rolling via git,
  daemon = versioned installers.
