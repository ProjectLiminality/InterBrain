# DreamNode Updater

**Purpose**: User-facing update workflow for DreamNodes - check, preview, summarize, and apply updates from peers.

## Directory Structure

```
dreamnode-updater/
├── ui/
│   └── update-preview-modal.ts  # Modal for update preview with accept/reject
├── commands.ts                  # Update commands (check, preview, apply)
├── dreamer-update-commands.ts   # Batch check for Dreamer's related nodes
├── update-checker-service.ts    # Service wrapper (single-node checking)
├── update-summary-service.ts    # LLM-powered commit summaries
├── updates-slice.ts             # Zustand state for update status
├── index.ts                     # Barrel export
└── README.md
```

## Responsibility Boundaries

### What This Feature Owns
- **Update workflow UI**: Preview modal, accept/reject actions
- **LLM summaries**: Translates git commits to user-friendly descriptions
- **Update state**: Zustand slice for tracking which nodes have updates
- **Submodule sync**: Detects standalone→submodule divergence

### What This Feature Does NOT Own
- **Network operations** → `social-resonance-filter` (fetch, pull, push)
- **Coherence beacon parsing** → `coherence-beacon` (relationship discovery)
- **Radicle CLI** → `social-resonance-filter` (P2P plumbing)

### How It Calls Into social-resonance-filter

```typescript
// Check for updates on selected node
const result = await gitSyncService.fetchUpdates(selectedNode.repoPath);

// Apply updates (cherry-pick peer commits)
await gitSyncService.pullUpdates(selectedNode.repoPath, commitHashes);

// Check for divergent branches
const divergence = await gitSyncService.checkDivergentBranches(repoPath);
```

## Main Exports

```typescript
export { registerUpdateCommands } from './commands';
export { registerDreamerUpdateCommands } from './dreamer-update-commands';
export { initializeUpdateCheckerService, getUpdateCheckerService } from './update-checker-service';
```

## Commands

| Command | Description |
|---------|-------------|
| `check-for-updates` | Check selected DreamNode for peer updates |
| `preview-updates` | Show update preview modal with LLM summary |
| `apply-updates` | Apply updates to selected DreamNode |

## Update Flow

```
User clicks "Check for Updates" on selected DreamNode
              │
              ▼
┌─────────────────────────────────────────┐
│ GitSyncService.fetchUpdates()           │
│ (from social-resonance-filter)          │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Store result in Zustand                 │
│ (enables visual update indicator)       │
└─────────────────────────────────────────┘
              │
              ▼
User clicks "Preview Updates"
              │
              ▼
┌─────────────────────────────────────────┐
│ LLM generates user-friendly summary     │
│ (falls back to keyword parsing)         │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ UpdatePreviewModal shows:               │
│ - Summary of changes                    │
│ - Commit list grouped by peer           │
│ - Accept / Reject buttons               │
└─────────────────────────────────────────┘
              │
              ▼
User clicks "Accept"
              │
              ▼
┌─────────────────────────────────────────┐
│ GitSyncService.pullUpdates()            │
│ (cherry-pick or fast-forward)           │
└─────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│ Check for coherence beacons             │
│ (hand off to coherence-beacon feature)  │
└─────────────────────────────────────────┘
```

## Special Cases

### InterBrain Self-Update
When updating the InterBrain DreamNode (UUID `550e8400-e29b-41d4-a716-446655440000`):
1. Apply updates via git pull
2. Run `npm run build`
3. Auto-reload plugin

### Submodule Updates
When a DreamNode has submodules that diverged from their standalone versions:
1. Detect standalone→submodule commit difference
2. Pull standalone commits into submodule
3. Update parent's submodule pointer
4. Commit pointer change

### Read-Only Repos
For GitHub-cloned repos without push access:
- Warns about divergent branches
- Offers hard reset to remote (discards local changes)

## Performance Note

Batch checking all nodes on startup was **removed** for performance.
Update checking is now **on-demand**: user selects a node and triggers check.
