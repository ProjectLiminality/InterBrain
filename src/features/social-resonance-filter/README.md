# Social Resonance Filter

**Purpose**: P2P commit propagation filter via Radicle network. Commits only reach you if your direct peers resonated with them - filtering out noise through social curation.

## Core Concept

The "filter" in Social Resonance Filter refers to how commit propagation works:
- You only receive commits from your **direct peers** who chose to accept/share them
- If a commit doesn't resonate with anyone in your network, it never reaches you
- This creates **natural curation** - quality rises through resonance, noise gets filtered out

## Directory Structure

```
social-resonance-filter/
├── services/
│   └── git-sync-service.ts      # Network-oriented git: fetch, pull, push, peer sync
├── radicle-service.ts           # Radicle CLI wrapper: init, clone, share, follow
├── passphrase-manager.ts        # Radicle auth with smart node detection
├── batch-init-service.ts        # Mass Radicle initialization
├── commands.ts                  # User-facing Radicle commands
├── housekeeping-commands.ts     # Maintenance: sync follow relationships
├── index.ts                     # Barrel export
└── README.md
```

## Responsibility Boundaries

### What This Feature Owns (P2P Plumbing)
- **Radicle CLI operations**: init, clone, share, follow, delegate, seed
- **Git sync operations**: fetch, pull, push with peer awareness
- **Passphrase management**: Smart detection of running node
- **Remote reconciliation**: Sync git remotes with liminal-web.json peers
- **Routing table queries**: Discover who has accepted your DreamNodes

### What This Feature Does NOT Own
- **Update workflow UI** → `dreamnode-updater` (modals, LLM summaries)
- **Coherence beacon detection** → `coherence-beacon` (relationship discovery)
- **GitHub publishing workflow** → `github-publishing` (public sharing)

## Main Exports

```typescript
// Commands
registerRadicleCommands(plugin, uiService, passphraseManager)
registerHousekeepingCommands(plugin)

// Services
RadicleService: isAvailable, init, clone, share, getSeeders, followPeer, addDelegate, reconcileRemotes
GitSyncService: fetchUpdates, pullUpdates, pushToAvailableRemote, checkDivergentBranches
PassphraseManager: getPassphrase, isPassphraseSet
getRadicleBatchInitService(): RadicleBatchInitService
```

## Architecture Notes

### Platform Support
- **macOS/Linux**: Full Radicle integration
- **Windows**: GitHub fallback (testable via `SIMULATE_WINDOWS=true`)

### Radicle Discovery
Searches for `rad` binary in: PATH, `~/.radicle/bin/rad`, `/usr/local/bin/rad`, `/opt/homebrew/bin/rad`

### Pure P2P Pattern
- **Delegates**: All peers are equal delegates (threshold=1, auto-accept)
- **Following**: Both node-level and repo-specific
- **Seeding**: `'all'` for public, `'followed'` for private

### Dual Remote Mode
When both Radicle and GitHub remotes exist:
- Push to **both** (GitHub for publishing, Radicle for collaboration)
- Priority: Radicle → GitHub → origin → first available

### Gap Detection
- Batch init detects .udd without radicleId but with git remote → repairs
- Clone normalizes titles and persists radicleId to .udd

## Dependents

Features that call into this one:
- `dreamnode-updater` - uses GitSyncService.fetchUpdates()
- `coherence-beacon` - uses GitSyncService for push operations
- `github-publishing` - uses RadicleBatchInitService
- `dreamweaving` - uses RadicleService for submodule URLs
- `uri-handler` - uses RadicleService for clone operations
