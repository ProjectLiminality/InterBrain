# Orchestration Architecture Refactor Plan

This document tracks the implementation plan for refactoring the spatial orchestration system from ~50 scattered primitives to a unified state machine approach.

## Goal

Replace the fragmented orchestration system with a clean state machine where:
1. **Events** trigger transitions (click, escape, keypress)
2. **Intent derivation** computes the target layout from minimal state + context
3. **Execution** dispatches target states to all nodes
4. **Snapshots** enable instant restoration on reload

## Architectural Principles

### 1. State Machine as Single Source of Truth

Layout transitions are driven by **explicit orchestration**, NOT React's reactive system.

**Correct Flow:**
```
Event → deriveIntent() → executeLayoutIntent() → [store + snapshot updated as side effects]
```

**Anti-pattern (eliminated):**
```
Event → store.setSpatialLayout() → useEffect fires → orchestration
```

### 2. Snapshot-Based Restoration

Instead of remembering minimal state and re-deriving layouts on reload, we:
1. **Snapshot the final computed positions** at the end of each transition
2. **Mount everything in place** on reload (no animation, no derivation)
3. **Only snapshot at quantized boundaries** (not continuous per-frame updates)

### 3. Unified Node API

All node movement goes through a single method:
```typescript
setTargetState(target: NodeTargetState, duration?: number, worldRotation?: Quaternion)
```

Where `NodeTargetState` is:
```typescript
type NodeTargetState =
  | { mode: 'active'; position: [number, number, number]; flipSide: 'front' | 'back' }
  | { mode: 'home' }  // Persistent → constellation, Ephemeral → exit + despawn
```

---

## Implementation Phases

### ✅ Phase 0: Revert to Clean State
- Reverted to commit 983615d as clean baseline
- Status: **COMPLETED**

### ✅ Phase 1: Define Orchestration Types
- Created `src/core/orchestration/types.ts`
- Defined `NodeTargetState`, `LayoutIntent`, `LayoutContext`, `DerivedIntentResult`
- Status: **COMPLETED**

### ✅ Phase 2: Implement setTargetState in DreamNode3D
- Single unified method for all node movement
- Handles active mode (position + flip) and home mode (persistent vs ephemeral)
- Status: **COMPLETED**

### ✅ Phase 3: Implement executeLayoutIntent in SpatialOrchestrator
- Takes `LayoutIntent`, computes all positions, dispatches `setTargetState` to all nodes
- Tracks `liminalWebRoles` for knowing which nodes are active
- Status: **COMPLETED**

### ✅ Phase 4: Create Intent Derivation Helpers
- `deriveFocusIntent()` - liminal web navigation
- `deriveHolarchyNavigationIntent()` - holarchy navigation
- `deriveConstellationIntent()` - return to constellation
- `deriveSearchIntent()` - search results display
- `deriveCopilotEnterIntent()` / `deriveCopilotShowRingIntent()` / etc.
- Status: **COMPLETED**

### ✅ Phase 5: Wire All Transitions Through New System
- `handleNodeClick` → `deriveFocusIntent + executeLayoutIntent`
- `onPointerMissed` → `deriveConstellationIntent + executeLayoutIntent`
- `useEscapeKeyHandler` → `deriveConstellationIntent + executeLayoutIntent`
- `useOptionKeyHandlers` → copilot ring show/hide
- Status: **COMPLETED**

### ✅ Phase 5b: Remove useEffect Orchestration
- Removed the problematic `useEffect` that watched `spatialLayout`
- This was causing circular dependencies and fighting with event handlers
- Event handlers now own all transitions directly
- Status: **COMPLETED**

### ✅ Phase 6: Implement Layout Snapshot System
- Define `LayoutSnapshot` interface
- Save snapshot at end of `executeLayoutIntent`
- Restore from snapshot on mount (instant, no animation)
- Clear snapshot when returning to constellation
- Status: **COMPLETED**

#### Phase 6 Subtasks:
1. [x] Define `LayoutSnapshot` type and storage utilities (`src/core/orchestration/types.ts`, `src/core/orchestration/snapshot-storage.ts`)
2. [x] Modify `executeLayoutIntent` to save snapshot after computing positions
3. [x] Implement snapshot restoration in orchestrator initialization (`restoreFromSnapshot`)
4. [x] Pass initial positions to DreamNode3D for instant mount (via `pendingMovements` with `isSnapshotRestore` flag)
5. [x] Handle sphere rotation restoration (stored in snapshot, restoration pending)
6. [ ] Test full reload cycle (needs manual testing)

### 🔄 Phase 7: Remove Legacy Orchestration Methods
- Remove commented-out legacy methods from DreamNode3D ✅ (interface updated)
- Remove legacy orchestrator methods (focusOnNode, etc.)
- Clean up unused state tracking
- Status: **IN PROGRESS** (partially completed - DreamNode3DRef interface cleaned up)

---

## Key Files

| File | Role |
|------|------|
| `src/core/orchestration/types.ts` | Type definitions (`NodeTargetState`, `LayoutIntent`, `LayoutSnapshot`) |
| `src/core/orchestration/intent-helpers.ts` | Intent derivation functions |
| `src/core/orchestration/snapshot-storage.ts` | IndexedDB persistence for layout snapshots |
| `src/core/components/SpatialOrchestrator.tsx` | Central orchestration hub (`executeLayoutIntent`, `restoreFromSnapshot`) |
| `src/features/dreamnode/components/DreamNode3D.tsx` | Node-level `setTargetState` |
| `src/core/components/DreamspaceCanvas.tsx` | Event handlers (click, escape), snapshot restoration on mount |
| `docs/architecture/layout-state-machine.md` | State machine specification |

---

## What NOT to Do

1. **Do NOT use `useEffect` to watch `spatialLayout` or `selectedNode`** — this creates circular dependencies
2. **Do NOT call legacy methods** (`moveToPosition`, `returnToConstellation`, etc.) — use `setTargetState`
3. **Do NOT snapshot per-frame state** (dynamic view scaling offsets, drag rotation) — only quantized transitions
4. **Do NOT derive layouts on reload** — use saved snapshot for instant restore

---

## Current Status

**Last Updated:** 2026-02-04

**Completed:** Phase 6 (Layout Snapshot System) is implemented:
- `LayoutSnapshot` type defined in `types.ts`
- `snapshot-storage.ts` handles IndexedDB persistence
- `executeLayoutIntent` saves snapshots after computing positions
- `restoreFromSnapshot` in SpatialOrchestrator restores layout on mount
- `DreamNode3DRef` interface cleaned up (legacy methods removed)
- Legacy helper functions (`moveNode`, `returnNodeToConstellation`, etc.) now use `setTargetState` internally

**Next Step:** Test the snapshot save/restore cycle manually, then complete Phase 7 by removing legacy orchestrator methods.

---

*See also:*
- `docs/architecture/layout-state-machine.md` — Full state machine specification
- `docs/architecture/orchestration-primitives-inventory.md` — Original primitives audit
