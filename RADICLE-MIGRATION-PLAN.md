# Radicle-Centric Architecture Migration Plan

**Status**: Planning Phase
**Created**: 2025-01-10
**Goal**: Refactor from dual Git/Radicle services to unified RadicleService with Radicle as single source of truth

---

## Executive Summary

### The Core Insight
Radicle and Git are inseparable in our architecture. Every collaboration operation involves both. Stop treating them as separate concerns.

### The Vision
- **One Service**: `RadicleService` (renamed from current, absorbing GitService)
- **One Source of Truth**: Radicle metadata drives Liminal Web (no parallel UUID graphs)
- **One-Directional Flow**: Radicle → UI (InterBrain adapts to Radicle, never interferes)
- **Organic Emergence**: `followed ∩ delegates` = collaboration edges (automatic)

### Current Problem
Three services (GitService, RadicleService, CoherenceBeaconService) with overlapping responsibilities. URIHandlerService duplicates clone logic. Metadata divergence between `.udd` files and Radicle state.

---

## Fundamental Operations (Radicle-Native Ontology)

These are the **atomic operations** that the new RadicleService should expose:

### A. Creation (Step Zero of Collaboration)
```typescript
async createDreamNode(title: string, type: 'dream' | 'dreamer'): Promise<DreamNode> {
  // 1. Create directory
  // 2. rad init --name <title> --default-branch main (creates both Radicle + git)
  // 3. Write .udd file with id = rad:* or did:key:*
  // 4. git add .udd && git commit -m "Initialize DreamNode"
  // 5. rad seed <RID> --scope followed
  // 6. git push rad main
  // 7. Return DreamNode
}
```

**Key Change**: No more `git init` followed by optional `rad init`. Radicle repos from day one.

### B. Saving Locally (Commit Without Sharing)
```typescript
async save(dreamNodePath: string, message: string): Promise<void> {
  // 1. git add -A
  // 2. git commit -m <message>
  // (Do NOT push - stays local until "Share Changes")
}
```

### C. Sharing (Make Changes Available)
```typescript
async share(dreamNodePath: string): Promise<void> {
  // 1. Check for uncommitted changes → auto-commit if needed
  // 2. git push rad main
  // 3. rad sync --announce (optional, faster propagation)
}
```

### D. Receiving (Clone from Peer)
```typescript
async cloneFromPeer(radicleId: string, peerDID: string, peerName: string): Promise<CloneResult> {
  // 1. rad clone <RID>
  // 2. rad follow <peer-DID> --alias <peerName> (global trust)
  // 3. rad id update --delegate <peer-DID> --threshold 1 (equal authority)
  // 4. rad seed <RID> --scope followed (only followed peers)
  // 5. git remote add <peerName> rad://<RID>/<peer-DID>
  // 6. Create Dreamer node for peer (if not exists)
  // 7. Link cloned Dream → Dreamer (update .udd relationships)
  // 8. Return { repoName, dreamerNode }
}
```

### E. Checking for Updates (Fetch + Preview)
```typescript
async checkForUpdates(dreamNodeRID: string): Promise<Update[]> {
  // 1. Query followed peers: rad follow --list
  // 2. Query delegates: rad id show <RID>
  // 3. Intersection = collaborators (followed ∩ delegates)
  // 4. For each collaborator:
  //    - rad sync (fetch from network)
  //    - git fetch <peer>
  //    - git log HEAD..<peer>/main --oneline
  // 5. Return Update[] with { peerName, commitCount, commits[] }
}
```

**Key Insight**: No custom state needed. Pure Radicle query + git log.

### F. Accepting Updates (Merge)
```typescript
async acceptUpdate(dreamNodePath: string, peerName: string): Promise<MergeResult> {
  // 1. git merge <peer>/main
  // 2. If conflicts: return { success: false, conflicts: [...] }
  // 3. If success: git push rad main && rad sync --announce
  // 4. Return { success: true }
}
```

---

## New RadicleService Structure (Proposed)

```typescript
export class RadicleService {
  // === CREATION & INITIALIZATION ===
  createDreamNode(title: string, type: 'dream' | 'dreamer'): Promise<DreamNode>
  isAvailable(): Promise<boolean>
  getIdentity(): Promise<RadicleIdentity>

  // === LOCAL OPERATIONS ===
  save(path: string, message: string): Promise<void>
  getStatus(path: string): Promise<GitStatus>
  getHistory(path: string, limit?: number): Promise<Commit[]>
  hasUncommittedChanges(path: string): Promise<boolean>
  hasUnpushedCommits(path: string): Promise<boolean>

  // === SHARING (PUSH) ===
  share(path: string): Promise<void>
  hasChangesToShare(path: string): Promise<boolean>

  // === RECEIVING (CLONE) ===
  cloneFromPeer(radicleId: string, peerDID: string, peerName: string): Promise<CloneResult>

  // === UPDATES (FETCH + MERGE) ===
  getCollaborators(radicleId: string): Promise<Peer[]>
  checkForUpdates(radicleId: string): Promise<Update[]>
  acceptUpdate(path: string, peerName: string): Promise<MergeResult>

  // === RADICLE NETWORK QUERIES ===
  getFollowedPeers(): Promise<Peer[]>              // rad follow --list
  getDelegates(radicleId: string): Promise<DID[]>  // rad id show <RID>
  getRadicleId(path: string): Promise<string | null>

  // === INTERNAL HELPERS (PRIVATE) ===
  private radSync(path: string): Promise<void>
  private radInit(path: string, name: string): Promise<void>
  private radClone(radicleId: string, dest: string): Promise<string>
  private followPeer(did: string, name: string): Promise<void>
  private addDelegate(path: string, did: string, name: string): Promise<void>
  private setSeedingScope(path: string, radicleId: string): Promise<void>
  private addPeerRemote(path: string, name: string, rid: string, did: string): Promise<void>
  private gitAdd(path: string, files?: string): Promise<void>
  private gitCommit(path: string, message: string): Promise<void>
  private gitPush(path: string, remote: string, branch: string): Promise<void>
  private gitFetch(path: string, remote: string): Promise<void>
  private gitMerge(path: string, remote: string): Promise<MergeResult>
  private gitLog(path: string, range?: string): Promise<Commit[]>
  private gitStatus(path: string): Promise<GitStatus>
}
```

---

## Code Migration Hot Spots

### Duplication to Eliminate

1. **Clone + Collaboration Handshake**
   - **Current**: URIHandlerService (419-541) + RadicleService (548-725)
   - **Both**: Follow peer, add delegate, seed repo
   - **New**: `RadicleService.cloneFromPeer()` (single implementation)

2. **Git Push**
   - **Current**: GitService.push() + RadicleService.share()
   - **New**: `RadicleService.share()` (combines commit + push rad)

3. **Status Checking**
   - **Current**: GitService (getUnpushedCommits, hasUncommittedChanges) + RadicleService (hasChangesToShare)
   - **New**: `RadicleService.getStatus()` (unified)

4. **Submodule Logic**
   - **Current**: CoherenceBeaconService (331-418) + GitService
   - **New**: Part of `RadicleService.cloneFromPeer()` flow

---

## Critical Migration Considerations

### ⚠️ METADATA SCHEMA CHANGE

**Old Schema** (UUID-based):
```json
{
  "uuid": "9e917053-6405-4e43-8360-efebccac3a00",
  "radicleId": "rad:z2bXt4w83tRJD8WykjQtBm7tjMbBe",
  "type": "dream",
  "liminalWebRelationships": ["caafc13b-..."],
  "submodules": [],
  "supermodules": []
}
```

**New Schema** (Radicle-native):
```json
{
  "id": "rad:z2bXt4w83tRJD8WykjQtBm7tjMbBe",  // Dream node
  // OR
  "id": "did:key:z6MksAEMTumQbRK1...",          // Dreamer node

  "title": "Square",
  "dreamTalk": "Square.png",
  "submodules": [],
  "supermodules": []
  // NO uuid field
  // NO radicleId field (redundant with id)
  // NO type field (inferred from id format)
  // NO liminalWebRelationships (read from Radicle)
}
```

**Migration Strategy**:
- **Phase 1**: Support BOTH schemas (read old, write new)
- **Phase 2**: Migration command to convert all `.udd` files
- **Phase 3**: Remove old schema support

### ⚠️ LIMINAL WEB RELATIONSHIPS

**Old Approach**: Stored in `.udd` → `liminalWebRelationships` array
**New Approach**: Computed from Radicle queries

**Critical Commands Affected**:
1. **"Sync Bidirectional Relationships"** → OBSOLETE or becomes "Sync from Radicle"
2. **"Scan Vault for Relationships"** → Becomes "Query Radicle for Collaborators"
3. **"Add Relationship"** → Becomes "Follow Peer + Add Delegate"

**New Relationship Query**:
```typescript
async getLiminalWebEdges(dreamNodeRID: string): Promise<Edge[]> {
  const followed = await rad.getFollowedPeers();
  const delegates = await rad.getDelegates(dreamNodeRID);

  // Intersection = edges
  return followed
    .filter(peer => delegates.includes(peer.did))
    .map(peer => ({ dreamer: peer.did, dreamNode: dreamNodeRID }));
}
```

### ⚠️ EXISTING DREAMNODES (NON-RADICLE)

**Problem**: Users may have DreamNodes that are git repos but NOT Radicle repos yet.

**Detection**:
```bash
rad . # Returns RID or error
```

**Strategy**:
- **Option A**: Lazy initialization (convert to Radicle on first share)
- **Option B**: Batch migration command ("Initialize all nodes as Radicle repos")
- **Option C**: Show warning badge in UI ("Not yet shareable - initialize Radicle")

**Recommendation**: Option A (lazy) + Option C (visibility)

### ⚠️ COHERENCE BEACON SYSTEM

**Current**: Custom git log parsing + beacon metadata
**Future**: Integrate with `RadicleService.checkForUpdates()`

**Changes Needed**:
- CoherenceBeaconService should USE RadicleService, not duplicate logic
- Beacon detection can stay custom (COHERENCE_BEACON metadata)
- Clone flow should use `RadicleService.cloneFromPeer()`

**Keep**: Beacon accept/reject workflow (still valuable)
**Refactor**: Use RadicleService for underlying operations

### ⚠️ URI HANDLER SERVICE

**Current**: 1041 lines, duplicates clone + handshake logic
**Future**: Thin wrapper around RadicleService

**Before**:
```typescript
// 130 lines of clone logic
const cloneResult = await this.radicleService.clone(...);
await this.radicleService.followPeer(...);
await this.radicleService.addDelegate(...);
// etc.
```

**After**:
```typescript
// 5 lines
const result = await this.radicleService.cloneFromPeer(rid, did, name);
await this.autoFocusNode(result.repoName);
```

### ⚠️ RADIAL BUTTON COMMANDS

**Current Mapping**:
- "Save Changes" → `interbrain:save-dreamnode`
- "Share Changes" → `interbrain:push-to-network`
- "Check for Updates" → `interbrain:preview-updates`

**New Mapping** (same command IDs, new implementations):
- "Save Changes" → `RadicleService.save()`
- "Share Changes" → `RadicleService.share()`
- "Check for Updates" → `RadicleService.checkForUpdates()`

**No UI changes needed** - just rewire command implementations.

---

## Incremental Migration Strategy

### Phase 0: Preparation (No Breaking Changes)
**Goal**: Set up new service without breaking existing functionality

1. ✅ Create `RADICLE-MIGRATION-PLAN.md` (this document)
2. ✅ Document current architecture (GitService, RadicleService, overlaps)
3. Create `src/services/radicle-service-v2.ts` (new implementation)
4. Implement core methods in parallel to existing services
5. Add feature flag: `useNewRadicleService` (default: false)

**Validation**: Run both services side-by-side, compare outputs

---

### Phase 1: Core Operations (Small, Testable)
**Goal**: Implement fundamental operations with tests

**Step 1.1**: Implement `createDreamNode()` in RadicleService v2
- Write tests for `rad init` → `.udd` creation → commit flow
- Add flag to use new creation flow
- Test with fresh DreamNode creation
- **Validation**: New nodes work identically to old nodes

**Step 1.2**: Implement `save()` and `share()`
- Write tests for commit + push flows
- Add flag to commands
- **Validation**: Manual save/share works for v2 nodes

**Step 1.3**: Implement `getCollaborators()` (Radicle queries)
- Test `rad follow --list` parsing
- Test `rad id show` parsing
- Test intersection logic
- **Validation**: Returns same collaborators as current liminalWebRelationships

**Checkpoint**: At this point, creation + local operations + queries work with v2.

---

### Phase 2: Clone & Collaboration (High Risk)
**Goal**: Replace URIHandler clone logic with unified implementation

**Step 2.1**: Implement `cloneFromPeer()` in RadicleService v2
- All steps: clone, follow, delegate, seed, remote, link
- **Critical**: Ensure Dreamer node creation is atomic
- Test with existing share links
- **Validation**: Clone via URI works identically

**Step 2.2**: Update URIHandlerService to use v2
- Replace 130-line clone flow with single method call
- Keep auto-focus, indexing, relationship scan logic
- **Validation**: Share link → clone → focus flow unbroken

**Step 2.3**: Implement `checkForUpdates()` and `acceptUpdate()`
- Fetch from peers
- Parse git log
- Merge with conflict handling
- **Validation**: Update preview + acceptance works

**Checkpoint**: Collaboration flows (clone, update) work with v2.

---

### Phase 3: Metadata Migration (Breaking Change)
**Goal**: Switch to new `.udd` schema

**Step 3.1**: Add schema migration support
- Implement `migrateUDDSchema(path: string)` utility
- Converts `uuid` → `id`, removes `radicleId`, removes `liminalWebRelationships`
- Add `rad .` call to populate `id` for existing Radicle repos
- **Non-destructive**: Keep old fields as `_legacy_uuid` backup

**Step 3.2**: Create migration command
- "Migrate All DreamNodes to Radicle Schema"
- Scans vault, converts all `.udd` files
- Commits changes with clear message
- **Validation**: Manual inspection of converted files

**Step 3.3**: Update all code to use new schema
- Search codebase for `node.uuid` → replace with `node.id`
- Search for `liminalWebRelationships` → replace with Radicle queries
- Update UDDService read/write methods
- **Validation**: All tests pass with new schema

**Checkpoint**: New schema is canonical, old schema deprecated.

---

### Phase 4: Command Refactoring (Low Risk)
**Goal**: Rewire commands to use RadicleService v2

**Step 4.1**: Update "Save Changes" command
- Replace GitService calls with `RadicleService.save()`
- Test with radial button
- **Validation**: Button works identically

**Step 4.2**: Update "Share Changes" command
- Replace GitService + RadicleService calls with `RadicleService.share()`
- **Validation**: Push to network works

**Step 4.3**: Update "Check for Updates" command
- Replace custom git log logic with `RadicleService.checkForUpdates()`
- **Validation**: Update preview shows correct commits

**Step 4.4**: Update Dreamer-specific "Check All Projects" command
- Query Radicle for all repos where dreamer is delegate
- Use `RadicleService.checkForUpdates()` for each
- **Validation**: Dreamer node button shows all updates

**Checkpoint**: All radial buttons use v2 service exclusively.

---

### Phase 5: Legacy Cleanup (Breaking Change)
**Goal**: Remove old services and obsolete commands

**Step 5.1**: Mark GitService as deprecated
- Move to `src/services/legacy/git-service.ts`
- Add deprecation warnings to all methods
- Keep for advanced use cases (merge conflict tools, etc.)

**Step 5.2**: Merge old RadicleService into new one
- Copy any missing utility methods
- Remove duplicated logic
- Rename `radicle-service-v2.ts` → `radicle-service.ts`

**Step 5.3**: Remove obsolete commands
- "Sync Bidirectional Relationships" → Delete or repurpose
- Any UUID-specific commands → Delete
- Update command palette

**Step 5.4**: Update documentation
- README.md: Update architecture section
- CLAUDE.md: Remove old patterns, document new service
- docs/: Update technical documentation

**Checkpoint**: Codebase fully migrated to Radicle-centric architecture.

---

### Phase 6: Coherence Beacon Integration (Optional Enhancement)
**Goal**: Simplify Coherence Beacon to use RadicleService

**Step 6.1**: Refactor beacon detection
- Use `RadicleService.checkForUpdates()` instead of custom git log
- Keep COHERENCE_BEACON parsing (still valuable metadata)

**Step 6.2**: Refactor beacon acceptance
- Use `RadicleService.cloneFromPeer()` for submodule cloning
- Use `RadicleService.acceptUpdate()` for cherry-pick

**Step 6.3**: Test beacon flow end-to-end
- **Validation**: Supermodule updates work seamlessly

**Checkpoint**: Coherence Beacon uses RadicleService exclusively.

---

## Testing Strategy

### Unit Tests (Per Phase)
- Test each RadicleService method in isolation
- Mock `execAsync` for git/rad commands
- Verify command construction and output parsing

### Integration Tests (Critical Paths)
1. **Creation Flow**: Create node → verify Radicle init → verify .udd schema
2. **Share Flow**: Create → save → share → verify git push rad
3. **Clone Flow**: Share link → clone → verify follow + delegate
4. **Update Flow**: Peer pushes → check updates → accept → verify merge

### Manual Testing Checklist
- [ ] Create new DreamNode (Dream + Dreamer types)
- [ ] Save changes locally (verify git commit)
- [ ] Share changes (verify rad push)
- [ ] Generate share link and clone on second machine
- [ ] Check for updates from peer
- [ ] Accept update and resolve conflicts (if any)
- [ ] Verify liminal web edges appear automatically
- [ ] Test Coherence Beacon acceptance
- [ ] Test GitHub fallback (if Radicle unavailable)

---

## Rollback Strategy

### If Migration Fails
1. **Revert to v1**: Set `useNewRadicleService = false` in feature flags
2. **Restore old schema**: Run `restoreLegacyUDDSchema()` migration (reverse)
3. **Keep both services**: Leave RadicleService v2 as experimental for future attempt

### Data Safety
- All `.udd` migrations keep `_legacy_uuid` backup field
- Git history preserves pre-migration state
- Migration command requires confirmation + creates backup branch

---

## Open Questions & Decisions Needed

### Q1: Lazy vs Eager Radicle Initialization
**Question**: Should existing git-only DreamNodes be converted immediately or on-demand?

**Options**:
- **A**: Lazy (convert on first share) ← **Recommended**
- **B**: Eager (batch migration command)
- **C**: Manual (user triggers per-node)

**Decision**: Start with A, provide B as optional command for power users.

---

### Q2: UUID Backward Compatibility
**Question**: Keep UUID field for legacy plugins/scripts?

**Options**:
- **A**: Remove entirely (clean break)
- **B**: Keep as `_legacy_uuid` (non-functional, just reference)
- **C**: Maintain dual identifiers (complex)

**Decision**: Use B for 1-2 releases, then A.

---

### Q3: Sync Bidirectional Relationships Command
**Question**: What happens to this command in new architecture?

**Options**:
- **A**: Delete (obsolete) ← **Recommended**
- **B**: Repurpose as "Sync from Radicle" (refresh cache)
- **C**: Keep for GitHub-only nodes (no Radicle)

**Decision**: B for now (useful for debugging), potentially A in future.

---

### Q4: GitHub-Only Nodes (No Radicle)
**Question**: How to handle clones from GitHub without Radicle?

**Current**: GitHub clone creates git repo with UUID in `.udd`
**Future**: Should GitHub clones also be Radicle repos?

**Options**:
- **A**: Yes, auto-initialize Radicle (may fail if user not set up)
- **B**: No, keep as git-only with UUID fallback
- **C**: Hybrid (try Radicle, fallback to git-only)

**Decision**: C (try Radicle, show non-blocking warning if fails).

---

## Success Criteria

### Migration is Complete When:
1. ✅ All radial buttons use RadicleService exclusively
2. ✅ URIHandlerService is <200 lines (thin wrapper)
3. ✅ GitService moved to `/legacy` (only advanced use)
4. ✅ All `.udd` files use new schema (`id` instead of `uuid`)
5. ✅ Liminal web edges computed from Radicle (no local storage)
6. ✅ Zero code duplication for clone/share/update flows
7. ✅ All tests pass (unit + integration + manual)
8. ✅ Documentation updated (README, CLAUDE.md, docs/)
9. ✅ No regressions in core workflows (save/share/clone/update)

---

## Timeline Estimate (Rough)

- **Phase 0**: 1 day (preparation)
- **Phase 1**: 3 days (core operations + tests)
- **Phase 2**: 5 days (clone/collaboration - high complexity)
- **Phase 3**: 2 days (metadata migration + validation)
- **Phase 4**: 2 days (command rewiring)
- **Phase 5**: 2 days (cleanup + documentation)
- **Phase 6**: 3 days (optional - Coherence Beacon)

**Total**: ~15-18 days of focused development + testing

---

## Next Steps (When Resuming)

1. **Review this document** - Fresh eyes, flag any gaps
2. **Create GitHub issue** - "Migrate to Radicle-Centric Architecture"
3. **Create feature branch** - `feature/radicle-service-v2`
4. **Start Phase 0** - Create v2 service file, implement first method
5. **Test incrementally** - Don't move to next phase until current one is solid
6. **Document learnings** - Update this plan as you discover edge cases

---

## References

- **README.md**: Radicle Architecture section (newly added)
- **Current Services**:
  - `src/services/git-service.ts` (1091 lines)
  - `src/services/radicle-service.ts` (929 lines)
  - `src/services/coherence-beacon-service.ts` (610 lines)
  - `src/services/uri-handler-service.ts` (1041 lines)
- **Radial Buttons**: `src/features/radial-buttons/radial-button-config.tsx`
- **Commands**: `src/commands/*.ts`

---

**Remember**: This is a refactor, not a rewrite. The goal is **incremental improvement** with **no regressions**. Move slowly, test thoroughly, keep rollback options open. The system works today - make it better without breaking what exists.

**Philosophy**: Trust Radicle's architecture. Build a beautiful window into the peer-to-peer network, not a replacement for it. Let the UI reflect Radicle reality, don't fight it.

---

*Document Version: 1.0*
*Last Updated: 2025-01-10*
*Status: Ready for Phase 0 execution when resuming work*
