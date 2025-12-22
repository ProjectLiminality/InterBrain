# DreamNode Updater

**Purpose**: User-facing update workflow for DreamNodes - check, preview, summarize, and apply updates from peers. This is the UI/UX layer; actual sync logic lives in `social-resonance-filter`.

## Directory Structure

```
dreamnode-updater/
├── store/
│   └── slice.ts                              # Zustand state for update status
├── services/
│   ├── update-summary-service.ts             # LLM-powered commit summaries
│   ├── collaboration-memory-service.ts       # Accept/reject tracking per peer
│   ├── collaboration-memory-service.test.ts  # Unit tests for memory service
│   ├── cherry-pick-workflow-service.ts       # Preview/accept/reject orchestration
│   └── smart-merge-service.ts                # Conflict resolution with search-replace merging
├── ui/
│   ├── cherry-pick-preview-modal.ts          # Enhanced modal with per-commit selection
│   ├── interbrain-update-modal.ts            # Simple all-or-nothing modal for self-updates
│   ├── conflict-resolution-modal.ts          # Modal for resolving merge conflicts
│   ├── preview-banner.ts                     # Floating banner during preview mode
│   └── rejection-history-modal.ts            # View and unreject previously rejected commits
├── scripts/
│   ├── setup-cherry-pick-test.sh             # Bash script to create test environment
│   └── test-cherry-pick-services.ts          # Integration test for services
├── docs/
│   └── collaboration-scenarios.md            # Design scenarios and test scripts
├── commands.ts                               # DreamNode update commands
├── dreamer-update-commands.ts                # Peer-centric batch update commands
├── collaboration-test-commands.ts            # UI testing commands (setup/cleanup)
├── test-scenarios.ts                         # Test data generation for UI testing
├── index.ts                                  # Barrel export
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
export { CherryPickPreviewModal } from './ui/cherry-pick-preview-modal';
export { InterBrainUpdateModal } from './ui/interbrain-update-modal';
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
| CherryPickPreviewModal shows:               |
| - Summary of changes (on-demand AI)         |
| - Commits grouped by peer                   |
| - Preview / Accept / Reject buttons         |
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

## Cherry-Pick Collaboration Model

The updater implements a cherry-pick-only collaboration model where users selectively accept or reject commits from peers.

### Core Services

**CollaborationMemoryService** (`services/collaboration-memory-service.ts`)
- Tracks accepted/rejected commits per peer, per DreamNode
- Stores memory in `collaboration-memory.json` within Dreamer nodes
- Supports deduplication via original hash parsing (`cherry picked from commit <hash>`)
- Provides unreject capability for changing decisions

**CherryPickWorkflowService** (`services/cherry-pick-workflow-service.ts`)
- Orchestrates the preview/accept/reject workflow
- Stash-based preview: stash work → cherry-pick → explore → decide → restore
- Filters rejected commits from pending updates
- Groups commits by peer for UI display

### Commit States

| State | Storage | Resurfaces? |
|-------|---------|-------------|
| Pending | Not stored (implicit) | Yes |
| Previewing | In-memory only | N/A (transient) |
| Accepted | `collaboration-memory.json` | No (merged) |
| Rejected | `collaboration-memory.json` | No (can unreject) |

### Storage Schema

`collaboration-memory.json` lives in each Dreamer node:
```json
{
  "version": 1,
  "dreamNodes": {
    "<dreamnode-uuid>": {
      "accepted": [
        { "originalHash": "...", "appliedHash": "...", "subject": "...", "relayedBy": [...] }
      ],
      "rejected": [
        { "originalHash": "...", "subject": "...", "rejectedAt": 1234567890 }
      ]
    }
  }
}
```

### Deduplication

When Alice and Bob both relay Charlie's commit:
- Cherry-pick creates new hash, but `-x` flag preserves original in message
- Service parses `(cherry picked from commit <hash>)` to deduplicate
- UI shows commit once with "Relayed by: Alice, Bob"

## UI Components

### CherryPickPreviewModal
Enhanced modal for the cherry-pick collaboration workflow (used for DreamNodes):
- Groups commits by peer (Dreamer)
- Checkboxes for individual commit selection
- Per-commit and per-peer accept/reject actions
- Preview mode: stash work → apply → explore → decide → restore
- On-demand AI summarization of selected commits
- Fixed footer with action buttons, scrollable content area
- Collapsible rejection history section

### InterBrainUpdateModal
Simple all-or-nothing modal for InterBrain self-updates:
- Shows commit count and expandable commit list
- On-demand AI summarization
- "Update & Reload" pulls, builds, and reloads the plugin
- No granular commit selection (must accept all)

### PreviewBanner
Floating banner that appears during preview mode:
- Non-modal - stays visible while user explores changes
- Shows commit count and stash status
- Quick access to Keep/Revert/Later actions
- Animates in/out smoothly

### RejectionHistoryModal
View and manage previously rejected commits:
- Lists all rejected commits with metadata
- Filter by peer
- Select multiple commits to unreject
- Unrejected commits will reappear as pending

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

## Testing

### Test Architecture

Testing follows a layered approach:

| Layer | What it tests | Location |
|-------|---------------|----------|
| **Unit** | Pure logic, hash parsing, deduplication | `services/*.test.ts` |
| **UI Testing** | Real Obsidian commands + git operations | Obsidian command palette |

### Unit Tests

Run with `npm run test` or `npm run check-all`.

**CollaborationMemoryService** (`services/collaboration-memory-service.test.ts`):
- `parseOriginalHash`: Extracts original commit hash from cherry-pick messages
- `getEffectiveOriginalHash`: Returns canonical hash for deduplication
- Hash deduplication scenarios: relay chains, multi-hop relays, direct vs relayed commits
- Memory file structure validation

### UI Testing Commands

Obsidian commands for end-to-end testing of the collaboration workflow:

| Command | Description |
|---------|-------------|
| `setup-collaboration-test` | Creates test DreamNode with Bob/Charlie peer remotes |
| `cherry-pick-preview` | Opens CherryPickPreviewModal for selected node |
| `show-preview-banner-demo` | Demonstrates the floating preview banner |
| `show-rejection-history` | Opens RejectionHistoryModal |
| `cleanup-collaboration-test` | Removes all test directories |

**Test Flow**:
1. Run "Setup Collaboration Test" - creates test environment in vault
2. Select the test DreamNode (_collab-test-node)
3. Run "Cherry-Pick Preview" - shows modal with real peer commits
4. Interact with UI: accept Bob's commit, reject Charlie's
5. Verify collaboration memory was updated correctly
6. Run "Cleanup Collaboration Test" to remove test environment

**What Setup Creates**:
```
vault/
├── _collab-test-node/       # Test DreamNode (git repo, you are Alice)
│   └── .udd                 # Node metadata
├── _collab-test-peers/      # Peer bare repos
│   ├── bob-bare/            # Bob's remote (1 commit ahead)
│   └── charlie-bare/        # Charlie's remote (1 commit ahead)
└── _collab-test-dreamers/   # Dreamer nodes for memory storage
    ├── bob/                 # Bob's Dreamer node
    └── charlie/             # Charlie's Dreamer node
```

## Dependencies

- `GitSyncService` (social-resonance-filter) - Fetch/pull operations
- `checkSubmoduleUpdatesFromNetwork` (social-resonance-filter) - Submodule detection
- `updateSubmodulesFromStandalone` (social-resonance-filter) - Submodule sync
- `CoherenceBeaconService` (coherence-beacon) - Relationship discovery after updates
- `ClaudeProvider` (conversational-copilot) - LLM summaries
