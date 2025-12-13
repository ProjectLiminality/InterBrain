# Social Resonance Filter

**Purpose**: P2P commit propagation via Radicle network. Commits only reach you if your direct peers resonated with them - filtering out noise through social curation.

## Core Concept

The "filter" in Social Resonance Filter refers to how commit propagation works:
- You only receive commits from your **direct peers** who chose to accept/share them
- If a commit doesn't resonate with anyone in your network, it never reaches you
- This creates **natural curation** - quality rises through resonance, noise gets filtered out

**InterBrain = Specialized Radicle GUI Client**: Radicle IS the Liminal Web. InterBrain provides a constrained, trust-based GUI for Radicle's peer-to-peer collaboration.

## Directory Structure

```
social-resonance-filter/
├── services/
│   ├── git-sync-service.ts      # Network-oriented git: fetch, pull, push
│   ├── radicle-service.ts       # Radicle CLI wrapper: init, clone, share, follow
│   ├── passphrase-manager.ts    # Radicle auth with smart node detection
│   ├── batch-init-service.ts    # On-demand Radicle initialization for sharing
│   └── peer-sync-service.ts     # Peer discovery and relationship sync
├── utils/
│   ├── submodule-sync.ts        # Submodule update detection and sync
│   └── vault-scanner.ts         # DreamNode discovery and UDD loading
├── docs/
│   └── radicle-architecture.md  # Pure P2P philosophy and vision
├── commands.ts                  # User-facing commands (thin handlers)
├── index.ts                     # Barrel export
└── README.md
```

## Philosophy Documentation

**[📖 Radicle Architecture](./docs/radicle-architecture.md)** - Deep dive into the P2P philosophy:
- "Radicle IS the Liminal Web" - identity collapse to single source of truth
- Transitive trust examples (Alice/Bob/Charlie scenarios)
- Intentional divergence - curation as a feature
- Merge conflict strategies

## Architecture: Commands → Services

Commands are **thin handlers** that delegate to services:

```
User triggers command
        ↓
commands.ts (validation, UI feedback)
        ↓
services/ (business logic)
        ↓
Radicle CLI / Git operations
```

## Commands

| Command | Description |
|---------|-------------|
| `initialize-dreamnode-radicle` | One-time Radicle setup for a DreamNode |
| `share-dreamnode` | Push local commits to Radicle network |
| `clone-from-radicle` | Clone a DreamNode from Radicle network |
| `discover-peer-acceptances` | Find which peers are seeding your DreamNodes |
| `sync-radicle-peer-following` | Sync follow/delegate relationships with Liminal Web |

## Main Exports

```typescript
// Commands
registerRadicleCommands(plugin, uiService, passphraseManager)

// Services
RadicleService: isAvailable, init, clone, share, getSeeders, followPeer, addDelegate, reconcileRemotes
GitSyncService: fetchUpdates, pullUpdates, pushToAvailableRemote, checkDivergentBranches
PassphraseManager: getPassphrase, isPassphraseSet
getRadicleBatchInitService(): RadicleBatchInitService
getPeerSyncService(radicleService): PeerSyncService

// Utilities
scanVaultForDreamNodes(vaultPath): VaultScanResult
parseGitmodules(content): ParsedSubmodule[]
checkSubmoduleUpdatesFromNetwork(parentPath, vaultPath): SubmoduleUpdate[]
```

## Responsibility Boundaries

### What This Feature Owns (P2P Plumbing)

**Radicle CLI Operations**:
- `rad init` - Publish DreamNode to network (private by default)
- `rad clone` - Receive DreamNode from network
- `rad follow` - Establish trust with a peer
- `rad id update --delegate` - Share with peer (equal collaboration)
- `rad seed --scope` - Configure seeding (all/followed)

**Git Network Operations**:
- `git fetch <peer>` - Get peer's fork
- `git push rad` - Publish merged state
- `git remote add/remove` - Track peer forks
- Cherry-pick / fast-forward peer commits

### What This Feature Does NOT Own
- **Local repo lifecycle** → `dreamnode` (git init, git add/commit, .udd management)
- **Update workflow UI** → `dreamnode-updater` (modals, LLM summaries)
- **Coherence beacon detection** → `coherence-beacon` (relationship discovery)
- **Liminal web GUI** → `liminal-web-layout` (spatial visualization)

## The Three Radicle Constraints (Pure P2P)

Every InterBrain DreamNode is configured with:

1. **Equal Delegates** (`--threshold 1`) - Every peer is equally authoritative
2. **Followed Scope** (`--scope followed`) - Only fetch from trusted peers
3. **Bidirectional Trust** - When Alice shares with Bob, both follow each other

## Asymmetric GUI ↔ Network Pattern

```
┌─────────────────────────────────────────────────────────┐
│                  Liminal Web GUI                         │
│            (Local organization, planning)                │
│                                                          │
│  User draws relationships → Updates liminal-web.json    │
│  This is LOCAL ONLY - does NOT change Radicle topology  │
└─────────────────────────────────────────────────────────┘
                            ↓
              Explicit share action triggers
                            ↓
┌─────────────────────────────────────────────────────────┐
│             Social Resonance Filter                      │
│           (Radicle network topology)                     │
│                                                          │
│  Share action → rad follow + delegate + git remotes     │
│  This ACTUALLY changes collaboration network             │
└─────────────────────────────────────────────────────────┘
                            ↓
              Changes propagate back to GUI
```

**Summary**:
- GUI → Network: **Does NOT propagate** (GUI is for planning)
- Network → GUI: **SHOULD propagate** (GUI reflects reality)

## Platform Support

- **macOS/Linux**: Full Radicle integration
- **Windows**: GitHub fallback (testable via `SIMULATE_WINDOWS=true`)

## Dependents

Features that call into this one:
- `dreamnode` - calls RadicleService.init() during creation
- `dreamnode-updater` - uses GitSyncService.fetchUpdates()
- `coherence-beacon` - uses GitSyncService for push operations
- `github-publishing` - uses RadicleBatchInitService
- `dreamweaving` - uses RadicleService for submodule URLs
- `uri-handler` - uses RadicleService for clone operations
