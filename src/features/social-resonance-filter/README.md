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
│   └── git-sync-service.ts      # Network-oriented git: fetch, pull, push, peer sync
├── utils/
│   └── submodule-sync.ts        # Submodule update detection and sync
├── radicle-service.ts           # Radicle CLI wrapper: init, clone, share, follow
├── passphrase-manager.ts        # Radicle auth with smart node detection
├── batch-init-service.ts        # On-demand Radicle initialization for sharing
├── commands.ts                  # User-facing Radicle commands
├── housekeeping-commands.ts     # Maintenance: sync follow relationships
├── index.ts                     # Barrel export
└── README.md
```

## Responsibility Boundaries

### What This Feature Owns (P2P Plumbing)

**Radicle CLI Operations**:
- `rad init` - Publish DreamNode to network (private by default)
- `rad clone` - Receive DreamNode from network
- `rad follow` - Establish trust with a peer
- `rad id update --delegate` - Share with peer (equal collaboration)
- `rad seed --scope` - Configure seeding (all/followed)
- `rad sync` - Network synchronization

**Git Network Operations**:
- `git fetch <peer>` - Get peer's fork
- `git push rad` - Publish merged state
- `git remote add/remove` - Track peer forks
- Cherry-pick / fast-forward peer commits

**Supporting Services**:
- Passphrase management with smart node detection
- Remote reconciliation (sync git remotes with Radicle peers)
- Routing table queries (discover who has your DreamNodes)
- Submodule sync (network-aware updates)

### What This Feature Does NOT Own
- **Local repo lifecycle** → `dreamnode` (git init, git add/commit, .udd management)
- **Update workflow UI** → `dreamnode-updater` (modals, LLM summaries)
- **Coherence beacon detection** → `coherence-beacon` (relationship discovery)
- **GitHub publishing workflow** → `github-publishing` (public sharing)
- **Liminal web GUI** → `liminal-web-layout` (spatial visualization)

## Relationship to Other Features

### DreamNode Feature (Upstream)
The `dreamnode` feature handles local repository lifecycle. When a DreamNode is created:
1. `dreamnode` runs `git init --template` (local repo)
2. `dreamnode` calls `RadicleService.init()` (this feature) to make it network-ready
3. The DreamNode gets a Radicle ID immediately but is **private and not seeded**
4. Later, explicit share actions publish it to the network

**Key insight**: DreamNodes are Radicle-ready from birth, but not "on the network" until explicitly shared.

### Liminal Web Layout (Downstream, Asymmetric Relationship)

**Critical Design Pattern**: GUI ≠ Collaboration Network

```
┌─────────────────────────────────────────────────────────────────┐
│                    Liminal Web GUI                               │
│              (Local organization, planning)                      │
│                                                                  │
│  User draws relationships → Updates liminal-web.json            │
│  This is LOCAL ONLY - does NOT change Radicle topology          │
│  Use case: "I want to tell Bob about this idea later"           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ User performs explicit share action
                              │ (video call, share link, etc.)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Social Resonance Filter                             │
│              (Radicle network topology)                          │
│                                                                  │
│  Share action → rad follow + rad delegate + git remotes         │
│  This ACTUALLY changes collaboration network                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Changes propagate back
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Liminal Web GUI                               │
│              (Reflects actual collaboration)                     │
│                                                                  │
│  Radicle topology changes → Should reflect in GUI               │
│  Who you follow, who has your nodes → visible relationships     │
└─────────────────────────────────────────────────────────────────┘
```

**Summary**:
- GUI → Network: **Does NOT propagate** (GUI is for planning/organization)
- Network → GUI: **SHOULD propagate** (GUI reflects reality)
- Purely local DreamNodes (not on Radicle): Only exist in GUI, not in network

### DreamNode Updater (Downstream)
Uses `GitSyncService.fetchUpdates()` to check for peer commits, then provides UX for preview/accept/reject.

### Coherence Beacon (Downstream)
After `dreamnode-updater` pulls commits, it hands off coherence beacon commits to this feature for relationship discovery.

## The Three Radicle Constraints (Pure P2P)

Every InterBrain DreamNode is configured with:

1. **Equal Delegates** (`--threshold 1`)
   - Every peer is equally authoritative
   - Any delegate can push changes
   - No hierarchy, pure peer-to-peer

2. **Followed Scope** (`--scope followed`)
   - Only fetch from peers you explicitly trust
   - Changes flow through social relationships
   - No stranger contributions

3. **Bidirectional Trust**
   - When Alice shares with Bob, both follow each other
   - Mutual delegation (both can push)
   - Symmetric collaboration by default

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

// Utilities
parseGitmodules(content): ParsedSubmodule[]
checkSubmoduleUpdatesFromNetwork(parentPath, vaultPath): SubmoduleUpdate[]
updateSubmodulesFromStandalone(parentPath, vaultPath, updates): { success, updated, failed }
```

## Current Implementation Status

### Working (✅)
- DreamNode creation initializes Radicle (private, no-seed)
- Fetch from peer remotes with source tracking
- Cherry-pick / fast-forward peer commits
- Remote reconciliation with liminal-web peers
- Batch init for sharing workflows
- Routing table queries (getSeeders)

### Partial (🚧)
- **Per-peer commit selection**: Currently all-or-nothing per pull
- **Cherry-pick UI granularity**: No per-commit accept/reject yet

### Future Vision (📋)
- **Per-commit/per-peer rejection**: Accept Alice's commits, reject Bob's
- **Rejection tracking metadata**: Remember rejected commits (never re-prompt)
- **LLM conflict resolution**: AI-assisted merge for conflicting edits

## Architecture Notes

### Platform Support
- **macOS/Linux**: Full Radicle integration
- **Windows**: GitHub fallback (testable via `SIMULATE_WINDOWS=true`)

### Radicle Discovery
Searches for `rad` binary in: PATH, `~/.radicle/bin/rad`, `/usr/local/bin/rad`, `/opt/homebrew/bin/rad`

### Dual Remote Mode
When both Radicle and GitHub remotes exist:
- Push to **both** (GitHub for publishing, Radicle for collaboration)
- Priority: Radicle → GitHub → origin → first available

### Network Propagation Timing
Radicle gossip protocol can take time to propagate repositories to seed nodes. Clone operations may fail with "no seeds found" during propagation - this is a temporary network state, not an error.

### Git Command Split

| DreamNode Feature | Social Resonance Filter |
|-------------------|-------------------------|
| `git init --template` | `rad init` / `rad clone` |
| `git add` / `git commit` | `git fetch <peer>` |
| `git stash` (creator mode) | `git push rad` |
| Local repo lifecycle | `git remote add/remove` |
| .udd management | `rad follow` / `rad delegate` |

### Submodule Sync Flow
When a DreamNode has submodules that diverged from their standalone versions:
1. `checkSubmoduleUpdatesFromNetwork()` compares standalone vs submodule HEAD
2. Reports which submodules have commits ahead
3. `updateSubmodulesFromStandalone()` pulls from standalone into submodule
4. Commits updated submodule pointers in parent repo

## Dependents

Features that call into this one:
- `dreamnode` - calls RadicleService.init() during DreamNode creation
- `dreamnode-updater` - uses GitSyncService.fetchUpdates(), submodule-sync utilities
- `coherence-beacon` - uses GitSyncService for push operations
- `github-publishing` - uses RadicleBatchInitService
- `dreamweaving` - uses RadicleService for submodule URLs
- `uri-handler` - uses RadicleService for clone operations
