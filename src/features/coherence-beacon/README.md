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

Beacon detection is now integrated into the unified cherry-pick workflow:

1. **Check for Updates** triggers `cherry-pick-preview` command
2. `getPendingCommits()` scans all peer commits for beacon metadata
3. Beacon commits appear in the **unified cherry-pick modal** with red styling
4. User can **preview** (clones supermodule + submodules, opens DreamSong)
5. User can **accept** (cherry-picks commit), **reject** (records rejection), or **later** (cleanup)

This unified flow means beacon commits are handled identically to regular commits, with the addition of automatic cloning of the supermodule and its dependencies.

## Directory Structure

```
coherence-beacon/
├── service.ts      # Beacon detection, parsing, ignition
├── service.test.ts # Unit tests
├── commands.ts     # ignite-coherence-beacons command
├── index.ts        # Barrel export
└── README.md
```

## Integration Flow

```
Check for Updates button
        ↓
dreamnode-updater/commands.ts (cherry-pick-preview)
        ↓
cherry-pick-workflow-service.getPendingCommits()
        ↓ scans for beacon metadata
cherry-pick-preview-modal.ts
        ↓ for beacon commits:
        ↓ • previewBeaconCommit() - clones + opens DreamSong
        ↓ • acceptSingleCommit() - clones + cherry-picks
        ↓ uses
uri-handler (cloneFromRadicle)
        ↓
cloneMissingSubmodules() - recursive submodule cloning
```

## Main Exports

```typescript
// Service
export {
  CoherenceBeaconService,
  type CoherenceBeacon,
  type BeaconRejectionInfo,
  type IgniteBeaconResult
} from './service';

// Commands
export { registerCoherenceBeaconCommands } from './commands';
```

## Entry Points

| Entry Point | Caller | Description |
|-------------|--------|-------------|
| `igniteBeacons()` | share/push commands | **Outgoing**: Creates beacons in sovereign repos after share |
| `checkCommitsForBeacons()` | cherry-pick-workflow-service | **Incoming**: Parses commits for beacon metadata |
| `parseOriginalHash()` | cherry-pick-workflow-service | Extract original hash from cherry-pick -x commits |

## Responsibility Boundaries

### What This Feature Owns
- **Outgoing**: Beacon ignition after share (create commits in sovereign repos)
- **Outgoing**: Non-invasive push algorithm (stash → detach → commit → push → rebase → restore)
- **Incoming**: Beacon metadata parsing (`COHERENCE_BEACON:` regex)
- **Incoming**: Original hash parsing for deduplication

### What This Feature Does NOT Own
- Update preview/summary UI → `dreamnode-updater` (cherry-pick-preview-modal)
- Clone operations → `uri-handler` → `social-resonance-filter`
- Submodule auto-cloning → `cherry-pick-preview-modal.cloneMissingSubmodules()`
- Network operations (fetch/push) → `social-resonance-filter`
- Relationship persistence → `dreamnode`
- Rejection persistence → `collaboration-memory-service`

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
- `dreamnode-updater/services/cherry-pick-workflow-service.ts` - calls `checkCommitsForBeacons()`
- `main.ts` - registers commands and creates service instance
