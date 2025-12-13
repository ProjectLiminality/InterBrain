# Coherence Beacon

**Purpose**: Detects and handles relationship discovery via commit metadata - when your DreamNode becomes a submodule of another DreamNode, the beacon signals this so you can clone the parent.

## Core Concept

A "coherence beacon" is metadata embedded in git commits that signals supermodule relationships:

```
COHERENCE_BEACON: {"type":"supermodule","radicleId":"rad:z123...","title":"ParentNode"}
```

When a peer adds your DreamNode as a submodule in their project, they include this beacon in the commit. When you receive this commit (via dreamnode-updater), the coherence beacon system:

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
export { CoherenceBeaconService, type CoherenceBeacon, type BeaconRejectionInfo } from './service';

// Commands
export { registerCoherenceBeaconCommands } from './commands';

// UI
export { CoherenceBeaconModal } from './ui/coherence-beacon-modal';
```

## Entry Points

| Entry Point | Caller | Description |
|-------------|--------|-------------|
| `checkCommitsForBeacons()` | dreamnode-updater | Primary: parses pulled commits for beacons |
| `checkForBeacons()` | check-coherence-beacons command | Manual: fetches + parses for beacons |

## Responsibility Boundaries

### What This Feature Owns
- Beacon detection and parsing (commit metadata)
- Modal UI for accept/reject decisions
- Beacon acceptance orchestration (clone → relationships → merge)
- Rejection info returned to caller (future: unified tracking in dreamnode-updater)

### What This Feature Does NOT Own
- Network operations (fetch/push) → `social-resonance-filter`
- Update preview/summary UI → `dreamnode-updater`
- Clone operations → `uri-handler` → `social-resonance-filter`
- Relationship persistence → `dreamnode`
- Gitmodules parsing → `dreamnode/utils/vault-scanner`
- Dreamer lookup → `dreamnode/utils/vault-scanner`
- Rejection persistence → caller's responsibility (dreamnode-updater)

## Atomic Acceptance

Beacon acceptance is atomic - the commit is only merged if all clones succeed:

1. Clone supermodule DreamNode
2. Initialize nested submodules (recursive)
3. Establish peer relationships
4. Cherry-pick beacon commit (only after success)

If any step fails, the beacon remains unmerged and can be retried later.

## Dependents

Features that call into this one:
- `dreamnode-updater` - calls `checkCommitsForBeacons()` after pulling
- `main.ts` - registers commands and creates service instance
