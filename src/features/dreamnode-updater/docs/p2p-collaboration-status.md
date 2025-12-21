# P2P Collaboration Feature - Situational Assessment

**Branch**: `feature/p2p-collaboration`
**Date**: December 2024

## The Journey So Far

### Starting Point
We began with the goal of implementing a **cherry-pick collaboration model** where:
- Users receive commits from peers (other Dreamer nodes)
- They can preview, accept, or reject individual commits
- Rejected commits are remembered and don't reappear
- Commits that multiple peers relay are deduplicated

### Phase 1: Core Infrastructure (COMPLETED)
Built the foundational cherry-pick workflow:
- **CherryPickWorkflowService** - Orchestrates preview/accept/reject flow
- **CollaborationMemoryService** - Persists acceptance/rejection decisions
- **CherryPickPreviewModal** - UI for viewing and acting on pending commits
- **PreviewBanner** - Floating banner during preview mode

### Phase 2: UI Refinements (COMPLETED)
Based on user testing feedback:
- Unified modal UI (no separate empty state modal)
- Live updates when restoring rejected commits
- Expandable commit message bodies (click ▶ to expand)
- Preview eye buttons (👁) for individual commits and peer groups
- Button label consistency (Accept/Reject/Later)

### Phase 3: Test Scenario (PARTIALLY COMPLETED)
Created `test-scenarios.ts` with a comprehensive scenario:
- **Alice, Bob, Charlie, David** - Four-person collaboration script
- Bob and Charlie as peers, relaying commits to David (test perspective)
- Alice's commit relayed by both (tests deduplication)

**Issue Discovered**: Test commits were unrealistic - each replaced entire README rather than incremental changes. This caused merge conflicts that weren't representative of real collaboration.

### Phase 4: Merge Conflict Exploration (IN PROGRESS)
Deep dive into git merge behavior:

**Key Findings**:
1. Git cherry-pick handles edits to **different sections** cleanly
2. Edits to **same location** (e.g., both adding after same line) conflict
3. This is fundamental git behavior, not a bug in our system

**Solutions Explored**:

| Approach | Status | Notes |
|----------|--------|-------|
| Search-replace merge driver | ✅ IMPLEMENTED | Finds common anchor lines, merges algorithmically |
| AI Magic glue fallback | ✅ IMPLEMENTED | Uses InferenceService for semantic merge |
| Conflict resolution modal | ✅ IMPLEMENTED | Shows conflict, offers resolution options |
| Union merge strategy | EXPLORED | Works for git merge, less reliable for cherry-pick |
| Canvas-aware merge | IDEA ONLY | High value for DreamSong collaboration, not started |

---

## Current State

### What's Built and Ready to Test
1. **Smart merge service** (`smart-merge-service.ts`)
   - Parses conflict markers
   - Tries search-replace resolution first
   - Falls back to AI Magic for complex conflicts

2. **Conflict resolution modal** (`conflict-resolution-modal.ts`)
   - Shows "Your version" vs "Incoming change"
   - Options: AI Magic (recommended), Accept Incoming, Keep Current, Skip
   - Previews resolution before applying

3. **Integrated into cherry-pick workflow**
   - Conflicts detected during preview
   - Modal opens automatically when conflict occurs
   - After resolution, returns to cherry-pick modal

### What Needs Testing
- [ ] Run "Setup Collaboration Test" with current scenario
- [ ] Trigger a conflict by previewing multiple README-modifying commits
- [ ] Verify conflict modal appears with correct information
- [ ] Test AI Magic resolution
- [ ] Test manual resolution options (Accept Incoming, Keep Current)

---

## Ideas Held in Suspension (NOT IMPLEMENTED)

### Canvas-Aware Merge Driver
**High potential value** for DreamSong collaboration.

The `.canvas` file is JSON with `nodes[]` and `edges[]` arrays. Since each element has a unique ID, we could:
- Merge arrays by ID (additions from both sides)
- Only conflict on same-ID modifications

**Status**: Design documented in `collaboration-scenarios.md`, no code written.

### README Structured Approach
Could add YAML frontmatter to READMEs for structured contributor lists:
```yaml
---
contributors:
  - name: Bob
    file: contributors/bob.md
---
```

**Status**: Considered, decided against (over-engineering for the README use case).

### Platform Matrix Testing
Full simulation with actual git repos and peer sync.

**Status**: Test scenarios defined, but using mock commits for now. True matrix testing deferred.

---

## Roadmap: What's Still Planned

### Immediate (This Session)
1. Fix test scenario to be realistic (incremental commits, not full replacements)
2. Test conflict detection and resolution flow end-to-end
3. Verify AI Magic integration works

### Short Term (Private Beta Scope)
1. **File additions** - Works trivially, most common use case
2. **Sequential commits from same peer** - Works if accepted together
3. **Conflict resolution with AI** - Ready to test
4. **Deduplication of relayed commits** - Already implemented

### Future (Post-Beta)
1. **Canvas-aware merge driver** - Would unlock smooth DreamSong collaboration
2. **Commit dependency tracking** - Know which commits depend on others
3. **Platform matrix testing** - Full multi-machine simulation
4. **Resonance chain tracking** - Track commit provenance through the network

---

## Design Principles Established

### Collaboration Pattern Spectrum
From `collaboration-scenarios.md`:

| Level | Pattern | Support |
|-------|---------|---------|
| 1 - Trivial | Adding new files | ✅ Full |
| 2 - Simple | Sequential edits from same peer | ✅ Full |
| 3 - Moderate | Edits to different sections | ✅ Git handles |
| 4 - Complex | Same-location insertions | ✅ AI Magic |

### User Guidance Philosophy
- Guide users toward patterns that work smoothly
- "Add new files rather than editing shared files"
- "Accept all commits from a peer together"
- When conflicts occur, explain and offer resolution

### The 80/20 Rule
Focus on making the common cases (file additions, sequential commits) frictionless. Handle edge cases (same-file conflicts) gracefully with AI assistance.

---

## Files Created/Modified This Session

### New Files
- `services/smart-merge-service.ts` - Conflict resolution logic
- `ui/conflict-resolution-modal.ts` - Conflict UI
- `docs/design/collaboration-scenarios.md` - Design exploration
- `docs/design/p2p-collaboration-status.md` - This document

### Modified Files
- `services/cherry-pick-workflow-service.ts` - Added conflict detection
- `ui/cherry-pick-preview-modal.ts` - Integrated conflict modal
- `test-scenarios.ts` - Single comprehensive scenario (still needs fix)
- `CLAUDE.md` - Added AI Magic integration rule
- `index.ts` - Exported new modules

---

## Next Steps (Recommended)

1. **Test current build** - See if conflict modal appears on README conflicts
2. **Fix test scenario** - Make commits incremental (Bob's 2nd commit builds on 1st)
3. **Test AI resolution** - Verify InferenceService integration works
4. **Document findings** - Update this doc based on test results
