# DreamNode Updater

**Purpose**: User-facing update workflow for DreamNodes - check, preview, summarize, and apply updates from peers. This is the UI/UX layer; actual sync logic lives in `social-resonance-filter`.

## Directory Structure

```
dreamnode-updater/
├── store/
│   └── slice.ts                 # Zustand state for update status
├── services/
│   └── update-summary-service.ts # LLM-powered commit summaries
├── ui/
│   └── update-preview-modal.ts  # Modal for update preview with accept/reject
├── commands.ts                  # DreamNode update commands
├── dreamer-update-commands.ts   # Peer-centric batch update commands
├── index.ts                     # Barrel export
└── README.md
```

## Responsibility Boundaries

### What This Feature Owns (UX Layer)
- **Update workflow UI**: Preview modal, accept/reject actions
- **LLM summaries**: Translates git commits to user-friendly descriptions
- **Update state**: Zustand slice for tracking which nodes have updates
- **Decision presentation**: Shows updates grouped by peer for user choice

### What This Feature Does NOT Own
- **Network operations** -> `social-resonance-filter` (fetch, pull, push)
- **Submodule sync logic** -> `social-resonance-filter` (detection, update execution)
- **Coherence beacon parsing** -> `coherence-beacon` (relationship discovery)
- **Radicle CLI** -> `social-resonance-filter` (P2P plumbing)

## Main Exports

```typescript
export { registerUpdateCommands } from './commands';
export { registerDreamerUpdateCommands } from './dreamer-update-commands';
export { UpdateSummaryService } from './services/update-summary-service';
export { createUpdatesSlice, type UpdatesSlice } from './store/slice';
```

## Commands

| Command | Description |
|---------|-------------|
| `check-for-updates` | Check selected DreamNode for peer updates |
| `preview-updates` | Show update preview modal with LLM summary |
| `apply-updates` | Apply updates to selected DreamNode |
| `check-all-updates-from-dreamer` | Check all projects from selected peer |

## Two Complementary Workflows

### 1. DreamNode-Centric (Select Dream -> Check Updates)
Select a DreamNode and check for updates from all peer collaborators:
- Updates grouped by peer (Alice, Bob, Charlie sections)
- Each peer's commits summarized separately
- Accept/reject per peer or per commit

### 2. Peer-Centric (Select Dreamer -> Sync All)
Select a Dreamer (peer) and sync all your shared projects with them:
- Iterates through all DreamNodes connected to that peer
- Reports which projects have updates available
- Complementary to the DreamNode-centric approach

## Update Flow

```
User clicks "Check for Updates" on selected DreamNode
              |
              v
+---------------------------------------------+
| GitSyncService.fetchUpdates()               |
| (from social-resonance-filter)              |
+---------------------------------------------+
              |
              v
+---------------------------------------------+
| checkSubmoduleUpdatesFromNetwork()          |
| (from social-resonance-filter)              |
+---------------------------------------------+
              |
              v
+---------------------------------------------+
| Store result in Zustand                     |
| (enables visual update indicator)           |
+---------------------------------------------+
              |
              v
User clicks "Preview Updates"
              |
              v
+---------------------------------------------+
| LLM generates user-friendly summary         |
| (falls back to keyword parsing)             |
+---------------------------------------------+
              |
              v
+---------------------------------------------+
| UpdatePreviewModal shows:                   |
| - Summary of changes                        |
| - Commits grouped by peer                   |
| - Accept / Reject buttons                   |
+---------------------------------------------+
              |
              v
User clicks "Accept"
              |
              v
+---------------------------------------------+
| GitSyncService.pullUpdates()                |
| (cherry-pick or fast-forward)               |
+---------------------------------------------+
              |
              v
+---------------------------------------------+
| Check for coherence beacons                 |
| (hand off to coherence-beacon feature)      |
+---------------------------------------------+
```

## Future Vision

### Cherry-Pick Granularity
The updater will support granular commit acceptance:
- **Per-peer**: Accept all commits from Alice, reject Bob's
- **Per-commit**: Down to individual commit accept/reject
- **Rejection tracking**: Metadata system to remember rejected commits (never re-prompt)

### Radical Distribution Model
Every single commit can be accepted or rejected based on resonance:
- Pure P2P - no central authority on "correct" history
- Each user builds their own curated version
- LLM magic handles merge conflicts and edge cases

### Custom UI Component
Currently uses Obsidian Modal, but will evolve into:
- Custom React component for maximum clarity
- Visual representation of peer commit streams
- Intuitive grouping and filtering interface

## Special Cases

### InterBrain Self-Update
When updating the InterBrain DreamNode (UUID `550e8400-e29b-41d4-a716-446655440000`):
1. Apply updates via git pull
2. Run `npm run build`
3. Auto-reload plugin

### Submodule Updates
When a DreamNode has submodules that diverged from their standalone versions:
1. Detect standalone->submodule commit difference (via social-resonance-filter)
2. Present update dialog to user
3. Apply updates via `updateSubmodulesFromStandalone()` (social-resonance-filter)

### Read-Only Repos
For GitHub-cloned repos without push access:
- Warns about divergent branches
- Offers hard reset to remote (discards local changes)

## Performance Note

Update checking is **on-demand**: user selects a node and triggers check.
No batch checking on startup (removed for performance).

## Dependencies

- `GitSyncService` (social-resonance-filter) - Fetch/pull operations
- `checkSubmoduleUpdatesFromNetwork` (social-resonance-filter) - Submodule detection
- `updateSubmodulesFromStandalone` (social-resonance-filter) - Submodule sync
- `CoherenceBeaconService` (coherence-beacon) - Relationship discovery after updates
- `ClaudeProvider` (conversational-copilot) - LLM summaries
