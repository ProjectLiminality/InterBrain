# Radicle Migration Roadmap

**Quick Reference**: High-level migration path for human iteration

---

## Core Insight

**UUID is just a string** - Replace value with Radicle ID instead of restructuring schema.

**Result**: ~70% complexity reduction, backward compatible approach.

---

## Migration Path

### Phase 1: Metadata Foundation
**Branch**: `feature/radicle-migration` (local only, no remote)
**Vault**: Fresh test vault with clean data

**Tasks**:
- Update DreamNode template + creation logic
- New nodes: Radicle ID as UUID value
- New Dreamer nodes: create `liminal-web.json` file
- **Migration script**: Convert existing Dreamer nodes → add `liminal-web.json` from old relationships
- Old nodes remain unchanged (backward compatible)
- **Verify**: Inspect `.udd` + `liminal-web.json` files look correct

---

### Phase 2: Mock Radicle System
**Goal**: In-codebase simulation for rapid iteration

**Tasks**:
- Create `MockRadicleService` class (parallel to real)
- Mock returns fake DIDs, RIDs, delegate lists, follow status
- Store mock state in-memory (no external files)
- Design mock data to match real Radicle outputs exactly
- **Verify**: Mock returns data matching real `rad` CLI format

---

### Phase 3: UI Integration
**Goal**: Rapid iteration with mock + handle legacy data

**Tasks**:
- Wire UI to use `MockRadicleService`
- Test relationship flows (follow, delegate, sync)
- Validate liminal web emerges from `followed ∩ delegates`
- **Legacy support**: Add UUID format detection (`isRadicleId()`)
- **Fallback**: Handle old UUID nodes gracefully
- **Test with old vault**: Ensure existing data continues working
- Confirm no merge conflicts with unidirectional relationships
- **Verify**: Both new and old vaults work correctly

---

### Phase 4: Real Radicle Testing
**Goal**: Switch mock → real, validate assumptions

**Tasks**:
- Toggle to actual `RadicleService`
- Test with real `rad` CLI commands
- Test with old vault data (not just clean vault)
- Verify mock assumptions match reality
- Fix any discrepancies
- **Verify**: Real collaboration flow works end-to-end

---

## Key Architectural Changes

### New Node Creation
```typescript
// Every node (Dream + Dreamer) = Radicle repo
rad init → get RID → use as UUID value
```

### Relationships
- **Old**: Stored in `.udd` → merge conflicts
- **New**: Separate `liminal-web.json` in Dreamer nodes only → no conflicts

### Backward Compatibility
- Keep `type`, `radicleId` fields (redundant but safe)
- Old UUID nodes detected and handled gracefully
- No breaking changes to existing vaults

---

## Immediate Next Steps

1. Create branch: `feature/radicle-migration`
2. Create clean test vault
3. Update `createDreamNode()` in RadicleService
4. Write migration script for existing Dreamer nodes
5. Verify metadata structure looks correct

---

## Success Criteria

- ✅ New nodes use Radicle ID as UUID
- ✅ Dreamer nodes have `liminal-web.json`
- ✅ Mock system enables rapid UI iteration
- ✅ Old vaults continue working (no breakage)
- ✅ Real Radicle commands work as expected
- ✅ No merge conflicts in relationship data

---

**Philosophy**: Backward compatible, iterative improvement. Test with both clean AND legacy data.
