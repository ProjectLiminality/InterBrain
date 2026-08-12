# Social Resonance Filter

**Purpose**: Peer collaboration over GitHub, curated by human choice. Commits
only enter your garden if *you* accepted them — and they only reach you
because a direct peer chose to share them. Quality rises through resonance;
noise gets filtered out.

## Core Concept

The "filter" in Social Resonance Filter is social, not algorithmic:

- Every peer has their own **sovereign outbox** per DreamNode — a GitHub repo
  under their account. `origin` is *yours*; every other GitHub remote owned by
  someone else is a **peer**.
- Peers push to their own outboxes; you **fetch** from peer remotes and
  **cherry-pick** what resonates (Check for Updates → accept/reject). Nothing
  auto-merges. Decisions persist in `collaboration-memory.json`.
- **Sharing is publishing** (#409): pushing your outbox also publishes the
  node via GitHub Pages — a DreamSong static site when one exists, the
  rendered README otherwise.

GitHub is the transport and identity layer (`gh` CLI, device-flow sign-in,
usernames as peer identity). The collaboration *model* — sovereignty,
resonance, beacons — is InterBrain's own; GitHub is just the pipes.
(The Radicle-era P2P prototype that originally shaped this feature is
preserved on the `feature/webrtc-transport` branch.)

## Directory Structure

```
social-resonance-filter/
├── services/
│   ├── sovereignty-service.ts   # The outbox model: ensure origin, share,
│   │                            #   invites, Pages enablement
│   ├── git-sync-service.ts      # Fetch/pull from peer remotes (Check for Updates)
│   └── peer-remotes.ts          # Invariant 2: peer-remote classification
├── ui/
│   └── share-changes-modal.ts   # Outbound mirror of Check-for-Updates
├── utils/
│   └── submodule-sync.ts        # Submodule update propagation
├── commands.ts                  # view-published-page, preview-share,
│                                #   push-to-network, invite-collaborators
└── index.ts
```

## Commands

| Command | Purpose |
|---|---|
| `push-to-network` | Share Changes: auto-commit, push origin (creating the outbox + enabling Pages on first share), ignite beacons, republish |
| `preview-share` | Review committed-but-unpushed commits before sharing |
| `invite-collaborators` | Copy an invite link to your outbox |
| `view-published-page` | Open the node's GitHub Pages site |
| `migrate-legacy-remotes` | Idempotent vault-wide sweep to the unified remote convention |

## Dependencies

- `gh` CLI (identity + repo/Pages API), git
- `coherence-beacon` consumes `shareChanges` and publishes beacons through `origin`
- `dreamnode-updater` consumes `GitSyncService.fetchUpdates` + `peer-remotes`

## Notes

- Remote classification reads *declared* URLs from git config, so
  `url.<base>.insteadOf` rewrites (https↔ssh, local test mirrors) don't
  change who a remote is.
- The daemon's activity scanner applies the same peer rule and the same
  collaboration-memory filtering, so the dashboard feed and the in-app
  modals always agree.
