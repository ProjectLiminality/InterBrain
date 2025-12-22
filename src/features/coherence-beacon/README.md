# Coherence Beacon

**Purpose**: Handles bidirectional relationship discovery via commit metadata - both outgoing (when you share submodule relationships) and incoming (when your DreamNode becomes a submodule of another).

## Core Concept

A "coherence beacon" is metadata embedded in git commits that signals supermodule relationships:

```
COHERENCE_BEACON: {"type":"supermodule","radicleId":"rad:z123...","title":"ParentNode","atCommit":"abc123..."}
```

### Outgoing Beacons (Share Flow)

When you click "Share Changes" on a DreamNode with submodules:

1. **Push** your changes to the network (Radicle/GitHub)
2. **Ignite** beacons: For each submodule, create a beacon commit in the sovereign repo
3. **Non-invasive push**: The beacon commit is pushed without forcing the sovereign's unpublished work

The beacon commit updates the sovereign's `.udd` file with a `supermodules` entry that tracks:
- `radicleId`: Parent DreamNode's Radicle ID
- `title`: Parent DreamNode's display name
- `atCommit`: The parent commit hash that included this as a submodule
- `addedAt`: Timestamp when relationship was recorded

### Incoming Beacons (Update Flow)

When a peer adds your DreamNode as a submodule and you receive their commits:

1. **Detects** the beacon metadata in the commit
2. **Presents** a modal explaining the relationship and consequences
3. **Clones** the parent DreamNode (and nested submodules) if accepted
4. **Establishes** peer relationships in the liminal web
5. **Merges** the beacon commit to complete the relationship

## Directory Structure

```
coherence-beacon/
├── ui/
│   └── coherence-beacon-modal.ts  # Accept/reject decision modal
├── service.ts                      # Beacon detection, parsing, acceptance
├── commands.ts                     # Check for beacons command
├── index.ts                        # Barrel export
└── README.md
```

## Integration Flow

```
social-resonance-filter (git fetch from peers)
        ↓
dreamnode-updater (preview/summarize commits)
        ↓ hands off beacon commits
coherence-beacon (this feature)
        ↓ if accepted, uses
uri-handler (clone from Radicle)
        ↓ uses
dreamnode (establish relationships)
```

## Main Exports

```typescript
// Service
export {
  CoherenceBeaconService,
  type CoherenceBeacon,
  type BeaconRejectionInfo,
  type IgniteBeaconResult  // New: result of outgoing beacon ignition
} from './service';

// Commands
export { registerCoherenceBeaconCommands } from './commands';

// UI
export { CoherenceBeaconModal } from './ui/coherence-beacon-modal';
```

## Entry Points

| Entry Point | Caller | Description |
|-------------|--------|-------------|
| `igniteBeacons()` | share/push commands | **Outgoing**: Creates beacons in sovereign repos after share |
| `checkCommitsForBeacons()` | dreamnode-updater | **Incoming**: Parses pulled commits for beacons |
| `checkForBeacons()` | check-coherence-beacons command | Manual: fetches + parses for beacons |

## Responsibility Boundaries

### What This Feature Owns
- **Outgoing**: Beacon ignition after share (create commits in sovereign repos)
- **Outgoing**: Non-invasive push algorithm (stash → detach → commit → push → rebase → restore)
- **Incoming**: Beacon detection and parsing (commit metadata)
- **Incoming**: Modal UI for accept/reject decisions
- **Incoming**: Beacon acceptance orchestration (clone → relationships → merge)
- Rejection info returned to caller (future: unified tracking in dreamnode-updater)

### What This Feature Does NOT Own
- Network operations (fetch/push) → `social-resonance-filter`
- Update preview/summary UI → `dreamnode-updater`
- Clone operations → `uri-handler` → `social-resonance-filter`
- Relationship persistence → `dreamnode`
- Gitmodules parsing → `dreamnode/utils/vault-scanner`
- Dreamer lookup → `dreamnode/utils/vault-scanner`
- Rejection persistence → caller's responsibility (dreamnode-updater)
- UDD supermodule entry format → `dreamnode/types/dreamnode.ts`

## Atomic Acceptance

Beacon acceptance is atomic - the commit is only merged if all clones succeed:

1. Clone supermodule DreamNode
2. Initialize nested submodules (recursive)
3. Establish peer relationships
4. Cherry-pick beacon commit (only after success)

If any step fails, the beacon remains unmerged and can be retried later.

## Non-Invasive Push Algorithm

When igniting beacons, we must not force the sovereign repo to push unpublished work. If the sovereign has:

```
A (pushed) → B → C → D (unpublished local work)
```

The beacon commit must be created on top of A, not D, so the user isn't forced to push B, C, D.

Algorithm:
1. **Stash** uncommitted changes
2. **Fetch** latest from remote
3. **Detach** to last pushed commit (origin/main)
4. **Update** `.udd` with supermodule entry
5. **Commit** with COHERENCE_BEACON metadata
6. **Push** only this commit to remote
7. **Return** to original branch
8. **Rebase** local work on top of new commit
9. **Restore** stashed changes

If rebase conflicts occur, the user is warned but the beacon commit still exists.

## Supermodule Entry Format

The `.udd` file tracks supermodule relationships with historical context:

```json
{
  "supermodules": [
    {
      "radicleId": "rad:z123...",
      "title": "ParentNode",
      "atCommit": "abc123...",
      "addedAt": 1703123456
    }
  ]
}
```

**Why `atCommit`?** If Alice is slow to check updates and David removes Circle from Cylinder, Alice should clone Cylinder@abc123 (when her work was relevant), not HEAD.

**Append-only**: Supermodule entries are never removed, creating a historical record of all projects that once included this DreamNode.

## Dependents

Features that call into this one:
- `social-resonance-filter/commands.ts` - calls `igniteBeacons()` after share/push
- `dreamnode-updater` - calls `checkCommitsForBeacons()` after pulling
- `main.ts` - registers commands and creates service instance
