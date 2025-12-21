# Collaboration Scenarios & Cherry-Pick Workflow Design

## Overview

This document explores the collaboration patterns in InterBrain's cherry-pick workflow, from trivial (works out of box) to complex (requires AI magic glue). It serves as:

1. **Conceptual script** for the Alice/Bob/Charlie/David test scenario
2. **Design guide** for the DreamSong canvas collaboration
3. **Scope definition** for private beta feature cutoff

## The Four-Person Test Scenario

### Cast
- **Alice**: Creates original content that gets relayed through the network
- **Bob**: Direct collaborator, relays Alice's work, adds own contributions
- **Charlie**: Another collaborator, also relays Alice's work, adds own contributions
- **David**: Our test perspective - receives commits from Bob and Charlie

### Timeline Script

```
Day 1: Alice creates "Project Vision" DreamNode
├── Initial commit: README.md with project description
└── Shares with Bob and Charlie

Day 2: Bob works on the project
├── Commit B1: Adds his introduction to README.md
├── Commit B2: Creates RESOURCES.md (new file)
└── Cherry-picks Alice's vision commit (now has provenance marker)

Day 3: Charlie works on the project
├── Commit C1: Adds her introduction to README.md
├── Commit C2: Creates DESIGN-NOTES.md (new file)
└── Cherry-picks Alice's vision commit (same content as Bob's cherry-pick)

Day 4: David connects to Bob and Charlie
├── Sees Bob offering: B1, B2, Alice's-commit-via-Bob
├── Sees Charlie offering: C1, C2, Alice's-commit-via-Charlie
└── Alice's commit is DEDUPLICATED (same originalHash)

David's choices:
├── Accept Alice's commit (from either peer) ✓ trivial
├── Accept B2 (new file) ✓ trivial
├── Accept C2 (new file) ✓ trivial
├── Accept B1 (README edit) ✓ works if first
├── Accept C1 (README edit) ⚠️ CONFLICTS if B1 already applied
└── Accept both B1 and C1 ⚠️ requires merge strategy
```

### Key Insight: Commit Independence

The critical realization is that **commits from different peers that touch the same file are fundamentally parallel branches**. Git has no way to know that B1 and C1 are both "add a section to Contributors" - it just sees two different diffs against the same base.

---

## Collaboration Pattern Spectrum

### Level 1: Trivial (Works Out of Box)

**Pattern: Adding new files**
- Each commit creates a new file
- No conflicts possible
- Cherry-pick always succeeds

**Examples:**
- Adding photos to a shared album
- Adding documents to a research collection
- Adding resource links as separate markdown files

**User guidance:** "To contribute, drag and drop files onto the DreamNode"

**Private beta scope:** ✅ Fully supported

---

### Level 2: Simple (Works with ordering)

**Pattern: Sequential edits to same file from same peer**
- Commits form a linear chain
- Cherry-pick in order always works
- Cherry-pick out of order may conflict

**Examples:**
- Bob makes edit 1, then edit 2, then edit 3
- David cherry-picks all three in order

**User guidance:** "Accept all commits from a peer together"

**Private beta scope:** ✅ Supported (UI encourages accepting all from peer)

---

### Level 3: Moderate (Works with smart merging)

**Pattern: Edits to different sections of same file**
- Two peers edit different parts of a file
- Git's merge strategies *might* handle this
- Depends on how "far apart" the edits are

**Git options to explore:**
```bash
# Try recursive merge strategy during cherry-pick
git cherry-pick -X theirs <commit>  # Accept incoming for conflicts
git cherry-pick -X ours <commit>    # Keep current for conflicts

# Three-way merge with specific strategy
git cherry-pick --strategy=recursive -X patience <commit>
```

**Examples:**
- Bob adds section at top of README
- Charlie adds section at bottom of README
- *Might* merge cleanly if git can identify the regions

**Private beta scope:** ⚠️ Partial - works sometimes, conflicts sometimes

---

### Level 4: Complex (Requires AI Magic Glue)

**Pattern: Edits to same section of same file**
- Two peers both edit the Contributors section
- Git cannot resolve - sees conflicting changes
- Semantically, both additions are valid

**The Magic Glue Opportunity:**

```
Before AI glue:
<<<<<<< HEAD
### Bob
Bob's introduction...
=======
### Charlie
Charlie's introduction...
>>>>>>> incoming

After AI glue (semantic merge):
### Bob
Bob's introduction...

### Charlie
Charlie's introduction...
```

The LLM understands the *intent* is "add a contributor section" and can merge both.

**Private beta scope:** ❌ Not in initial scope, but designed for future

---

## DreamSong Canvas Collaboration

### Canvas File Structure

The `.canvas` file is JSON:
```json
{
  "nodes": [
    { "id": "abc123", "type": "text", "x": 100, "y": 200, "text": "..." },
    { "id": "def456", "type": "file", "x": 300, "y": 200, "file": "image.png" }
  ],
  "edges": [
    { "id": "edge1", "fromNode": "abc123", "toNode": "def456" }
  ]
}
```

### Canvas Collaboration Patterns

#### Level 1: Adding new nodes (Trivial... mostly)

**The challenge:** Even adding a new node modifies the same `.canvas` file.

**However:** If nodes have unique IDs and are appended to arrays, a smart merge *could* work.

**Potential solution: Canvas-aware merge driver**
```bash
# .gitattributes
*.canvas merge=canvas-merge
```

A custom merge driver that understands canvas structure:
- Merge `nodes` arrays (combine unique IDs)
- Merge `edges` arrays (combine unique IDs)
- Conflict only on same-ID modifications

**Private beta scope:** 🔬 Worth exploring - could unlock huge value

#### Level 2: Editing existing nodes

**The challenge:** Two people edit the same text node.

**Git sees:** Conflicting changes to the same JSON object.

**AI glue opportunity:** Semantic text merging within the node.

**Private beta scope:** ❌ Complex, defer to later

#### Level 3: Restructuring/moving nodes

**The challenge:** Spatial layout is meaningful in canvas.

**Git sees:** Changed x/y coordinates as conflicts.

**AI glue opportunity:** Layout reconciliation.

**Private beta scope:** ❌ Very complex, defer to later

---

## Recommended Private Beta Scope

### Fully Supported
1. **New file contributions** - drag & drop files
2. **Sequential commits from same peer** - accept all together
3. **Deduplication of relayed commits** - same originalHash

### Partially Supported (with warnings)
4. **Parallel README edits** - warn user of potential conflict
5. **Canvas node additions** - explore custom merge driver

### Deferred (designed for, not implemented)
6. **AI magic glue for conflicts** - architecture ready, not active
7. **Semantic canvas merging** - future feature
8. **Complex multi-peer edit reconciliation** - future feature

---

## Technical Approaches to Explore

### 1. Git Merge Strategies for Cherry-Pick

```typescript
// Try cherry-pick with different strategies
async function smartCherryPick(hash: string): Promise<CherryPickResult> {
  // First try: standard cherry-pick
  try {
    await exec(`git cherry-pick -x ${hash}`);
    return { success: true, strategy: 'standard' };
  } catch (e) {
    await exec('git cherry-pick --abort');
  }

  // Second try: with patience algorithm (better for additions)
  try {
    await exec(`git cherry-pick -x -X patience ${hash}`);
    return { success: true, strategy: 'patience' };
  } catch (e) {
    await exec('git cherry-pick --abort');
  }

  // Third try: accept theirs for conflicts (if user approves)
  // This loses local changes in conflict regions

  return { success: false, needsManualMerge: true };
}
```

### 2. Canvas-Aware Merge Driver

```typescript
// Custom merge for .canvas files
function mergeCanvasFiles(base: Canvas, ours: Canvas, theirs: Canvas): Canvas {
  return {
    nodes: mergeArraysById(base.nodes, ours.nodes, theirs.nodes),
    edges: mergeArraysById(base.edges, ours.edges, theirs.edges)
  };
}

function mergeArraysById<T extends {id: string}>(
  base: T[], ours: T[], theirs: T[]
): T[] {
  const result = new Map<string, T>();

  // Start with base
  base.forEach(item => result.set(item.id, item));

  // Apply ours
  ours.forEach(item => result.set(item.id, item));

  // Apply theirs (new items only, or flag conflicts)
  theirs.forEach(item => {
    if (!result.has(item.id)) {
      result.set(item.id, item);
    } else if (JSON.stringify(result.get(item.id)) !== JSON.stringify(item)) {
      // Same ID, different content = conflict
      // For now: theirs wins for new additions, ours wins for modifications
    }
  });

  return Array.from(result.values());
}
```

### 3. Conflict Detection Before Preview

```typescript
// Check if cherry-pick would conflict BEFORE showing preview
async function wouldConflict(hash: string): Promise<boolean> {
  try {
    // Dry-run cherry-pick
    await exec(`git cherry-pick --no-commit ${hash}`);
    await exec('git reset --hard HEAD');
    return false;
  } catch (e) {
    await exec('git cherry-pick --abort').catch(() => {});
    return true;
  }
}
```

---

## User Guidance for Smooth Collaboration

### Do's
- Add new files rather than editing shared files
- Make small, focused commits with clear messages
- Accept all commits from a peer together (preserves their chain)
- Use the preview feature before accepting

### Don'ts
- Edit the same section another collaborator is working on
- Cherry-pick commits out of order from the same peer
- Make large commits that touch many files

### UI Guardrails
- Group commits by peer (done ✅)
- "Accept All" button per peer (done ✅)
- Conflict warning before cherry-pick (to implement)
- Suggest "New File" pattern for contributions (to implement)

---

## Next Steps

1. **Fix test scenario** to follow the realistic timeline above
2. **Implement conflict detection** before preview
3. **Explore canvas merge driver** as high-value unlock
4. **Design AI glue architecture** for future conflict resolution
