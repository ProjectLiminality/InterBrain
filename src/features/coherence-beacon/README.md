# Coherence Beacon Feature

**Purpose**: Detects and manages "coherence beacons" - metadata in git commits signaling when one DreamNode becomes a submodule of another, enabling decentralized discovery of who is using your ideas.

## Key Files

- **`service.ts`** (695 lines) - Core beacon logic: detects `COHERENCE_BEACON` metadata in git commits, clones supermodules from Radicle network, manages atomic accept/reject operations with full submodule recursion
- **`commands.ts`** (152 lines) - Obsidian command registration: "Push to Network" (intelligent remote detection), "Check for Updates" (beacon discovery + modal flow), InterBrain self-update handler
- **`ui/coherence-beacon-modal.ts`** (98 lines) - User decision modal: presents beacon info, explains clone consequences, handles accept/reject callbacks
- **`index.ts`** (3 lines) - Public exports

## Main Exports

```typescript
export { registerCoherenceBeaconCommands } from './commands';
export { CoherenceBeaconService } from './service';
```

## Architecture Notes

**Service Layer**:
- Parses git log for `COHERENCE_BEACON: {"type":"supermodule","radicleId":"...","title":"..."}` JSON in commit messages
- Uses `rad sync --fetch` for Radicle network synchronization
- Implements atomic beacon acceptance: ALL clones succeed before merging beacon commit (retryable on failure)
- Recursive submodule cloning: both nested (git submodules) and sovereign (vault root clones)
- Bidirectional relationship tracking: establishes liminal-web connections between cloned nodes and source peer's Dreamer node
- Rejection tracking: stores rejected beacons in `.git/interbrain-rejected-beacons.json` to prevent re-prompting

**Command Integration**:
- `push-to-network`: Uses `GitSyncService` to intelligently push to available remotes (Radicle, GitHub, or both)
- `check-coherence-beacons`: Fetches beacons, presents modal per beacon, handles acceptance workflow
- Special case: `InterBrain` DreamNode updates via GitHub pull + rebuild

**UX Flow**:
1. User runs "Check for Updates" on selected DreamNode
2. Service fetches from Radicle, parses commits for beacons
3. For each unrejected beacon, modal presents supermodule info
4. Accept: Clone supermodule + all nested submodules + establish peer relationships + merge beacon commit
5. Reject: Record rejection locally, never show again

## Issues & Flags

- **Heavy Node.js dependencies**: Uses `child_process.exec` for all git/rad operations (no git library abstraction)
- **Long service file**: 695 lines could be split into smaller modules (e.g., `beacon-parser.ts`, `submodule-cloner.ts`, `peer-relationships.ts`)
- **Error handling**: Network failures during accept show helpful retry messages but leave partial clones (acceptable by design)
- **PATH manipulation**: Hardcoded Radicle binary path detection (`~/.radicle/bin/rad`, `/usr/local/bin/rad`) - could be configuration
- **Git protocol workaround**: Sets `GIT_ALLOW_PROTOCOL=file:rad` to enable rad:// URLs in submodules (security consideration)

## Responsibility Boundaries

### What This Feature Owns
- **Beacon detection**: Parsing `COHERENCE_BEACON` metadata in git commits
- **Beacon acceptance**: Clone supermodules, establish relationships
- **Beacon rejection**: Track rejected beacons to prevent re-prompting
- **User decision modal**: Present beacon info, accept/reject UI

### What This Feature Does NOT Own
- **Network operations** → `social-resonance-filter` (fetch, pull, push)
- **Update preview UI** → `dreamnode-updater` (summaries, preview modal)
- **Radicle CLI** → `social-resonance-filter` (P2P plumbing)

### Integration Point

Called BY `dreamnode-updater` after applying updates:
```typescript
// In dreamnode-updater/commands.ts after pullUpdates:
const beacons = await coherenceBeaconService.checkCommitsForBeacons(
  selectedNode.repoPath,
  updateStatus.commits
);
if (beacons.length > 0) {
  // Present CoherenceBeaconModal for each beacon
}
```

## Dependencies

- `GitSyncService` (social-resonance-filter) - Push/pull operations
- `GitDreamNodeService` (dreamnode) - Relationship management via liminal-web.json
- `GitOperationsService` (dreamnode) - Build operations for InterBrain self-update
- `UDDService` (dreamnode) - Reading/writing .udd metadata
- `RadicleService` (social-resonance-filter) - Radicle network integration
- `VaultService` (core) - Vault path resolution
- `URIHandlerService` (uri-handler) - Radicle cloning via `rad://` URLs
