# Orchestration Primitives Inventory

This document catalogs all atomic operations in the DreamNode spatial orchestration system.
Use this as the foundation for architectural refactoring.

---

## 1. Node Commands (What Orchestrator Tells a Node)

### Movement Commands (DreamNode3D ref methods)

| Command | Purpose | Parameters | Notes |
|---------|---------|------------|-------|
| `moveToPosition` | Move to absolute world position | `(target, duration?, easing?)` | Default: 1000ms, easeOutCubic |
| `returnToConstellation` | Return to anchor position | `(duration?, easing?, worldRotation?)` | Default: easeInQuart |
| `returnToScaledPosition` | Return to scaled anchor | `(duration?, worldRotation?, easing?)` | Accounts for dynamic scaling |
| `interruptAndMoveToPosition` | Cancel + move | `(target, duration?, easing?)` | Uses visual ref for start |
| `interruptAndReturnToConstellation` | Cancel + return | `(duration?, easing?, worldRotation?)` | |
| `interruptAndReturnToScaledPosition` | Cancel + return scaled | `(duration?, worldRotation?, easing?)` | |
| `setActiveState` | Switch position mode | `(active: boolean)` | 'constellation' ↔ 'active' |

### State Commands (Store actions)

| Command | Purpose | Slice | Notes |
|---------|---------|-------|-------|
| `startFlipAnimation` | Begin flip | DreamNode | Direction: 'front-to-back' \| 'back-to-front' |
| `completeFlipAnimation` | End flip | DreamNode | Sets isFlipped based on direction |
| `setFlippedNode` | Set focused flip node | DreamNode | Clears previous if different |
| `resetAllFlips` | Clear all flip state | DreamNode | |
| `setSelectedNode` | Select node | LiminalWeb | Updates navigation history |
| `setCreatorMode` | Toggle creator mode | DreamNode | |
| `setCarouselIndex` | Set canvas index | DreamNode | For DreamSong carousel |
| `cycleCarousel` | Cycle carousel | DreamNode | Direction + wrapping |

### Query Methods (DreamNode3D ref)

| Query | Returns | Notes |
|-------|---------|-------|
| `getCurrentPosition` | `[x, y, z]` | Uses ref, not state (for accuracy) |
| `isMoving` | `boolean` | Check if animating |

---

## 2. Layout Transitions (What Orchestrator Can Do)

### SpatialOrchestrator Methods

| Method | Purpose | Input | Side Effects |
|--------|---------|-------|--------------|
| `focusOnNode` | Liminal web layout | `nodeId` | Spawns ephemeral, sets spatialLayout |
| `focusOnNodeWithFlyIn` | Focus + extended fly-in | `nodeId, newNodeId` | New node gets longer animation |
| `returnToConstellation` | Exit liminal web | - | Returns all to scaled positions |
| `showSearchResults` | Search honeycomb | `DreamNode[]` | No center node |
| `showEditModeSearchResults` | Edit mode rings | `centerId, results[]` | Stable center |
| `reorderEditModeSearchResults` | Reorder during edit | - | Fast 300ms transitions |
| `showSupermodulesInRings` | Holarchy supermodules | `centerId, supermoduleIds[]` | Replaces dreamer layout |
| `showDreamersInRings` | Restore dreamers | `centerId` | Reverse of holarchy |
| `hideRelatedNodesInLiminalWeb` | Hide ring nodes | - | For radial button interaction |
| `showRelatedNodesInLiminalWeb` | Show ring nodes | - | Restore from hidden |
| `applyConstellationLayout` | Recompute positions | - | From relationship graph |

---

## 3. Position Modes & Transition Types

### Node Position Modes
- **`constellation`**: Node follows anchor + radial offset (sphere layout)
- **`active`**: Node at explicit world position (liminal web)

### Transition Types (animation behavior)
- **`liminal`**: Move to explicit position, stay in active mode
- **`constellation`**: Animate to anchor, switch to constellation mode
- **`scaled`**: Animate to scaled position, switch to constellation mode
- **`ephemeral-exit`**: Exit animation, queue despawn on complete

---

## 4. Layout States (What Orchestrator Tracks)

### SpatialLayoutMode (CoreSlice)
- `constellation` - All nodes at anchor positions
- `liminal-web` - Center node + rings
- `search` - Honeycomb search results
- `edit` - Edit mode with stable center
- `relationship-edit` - Relationship editing
- `copilot` - Copilot mode
- `creation` - Node creation mode

### Derived States (computed, not stored)
- **Holarchy Mode**: `flipState.flippedNodeId !== null && isFlipped && !isFlipping`
- **Ring Roles**: `{ center, ring1, ring2, ring3, sphere }` - tracked in orchestrator ref

---

## 5. Ephemeral Node Lifecycle

### States
1. **Not mounted**: Node exists in store but not rendered
2. **Spawning**: Animating from spawn position to target
3. **Active**: In liminal web, responding to orchestrator
4. **Exiting**: Animating from current position to exit
5. **Queued for despawn**: In despawn queue, waiting for staggered unmount

### Store Actions
| Action | Purpose |
|--------|---------|
| `spawnEphemeralNode` | Create single ephemeral |
| `spawnEphemeralNodesBatch` | Batch spawn |
| `despawnEphemeralNode` | Remove from map |
| `clearEphemeralNodes` | Remove all |

### Lifecycle Protection
- `pendingMovements` queue for moves issued before ref registered
- `queueEphemeralDespawn` for staggered unmount (40ms intervals)
- `cancelEphemeralDespawn` for reused nodes

---

## 6. Animation Configuration

### Durations
| Animation | Default Duration |
|-----------|-----------------|
| Node movement | 1000ms |
| Ephemeral spawn | 1000ms |
| Ephemeral exit | 1000ms |
| Flip animation | 600ms |
| Ring stagger | 40ms between nodes |
| Reorder animation | 300ms |
| Hide/show rings | 500ms |

### Easing Functions
| Name | Formula | Use Case |
|------|---------|----------|
| `easeOutCubic` | `1 - (1-t)³` | Default movement |
| `easeInQuart` | `t⁴` | Return to constellation |
| `easeOutQuart` | `1 - (1-t)⁴` | New nodes flying in |
| `easeInOutQuart` | S-curve | Smooth transitions |
| `easeInOutQuad` | S-curve (gentler) | Flip animation |

---

## 7. Event → Action Mapping

### User Events
| Event | Handler Location | Actions Triggered |
|-------|------------------|-------------------|
| Node click | DreamspaceCanvas | `setSelectedNode` → `focusOnNode` → (maybe) `startFlipAnimation` |
| Node double-click | DreamNode3D | `onDoubleClick` callback |
| Flip button click | DreamNode3D | Command: `'flip-selected-dreamnode'` |
| Escape key | useEscapeKeyHandler | `returnToConstellation` |
| Option key | useLiminalWebOptionKeyHandler | `hideRelatedNodes` / `showRelatedNodes` |

### Internal Events
| Event | Source | Actions Triggered |
|-------|--------|-------------------|
| Flip animation complete | DreamNode3D useFrame | `completeFlipAnimation` → (subscription) `showSupermodulesInRings` |
| Ephemeral mount complete | DreamNode3D | Execute pending movement from queue |
| Exit animation complete | DreamNode3D useFrame | `queueEphemeralDespawn` |

---

## 8. State Ownership Matrix

| State | Owner | Read By | Written By |
|-------|-------|---------|------------|
| Node anchor position | DreamNodeSlice | Everyone | `batchUpdateNodePositions` |
| Node visual position | DreamNode3D ref | Orchestrator | useFrame animation |
| Flip state | DreamNodeSlice | DreamNode3D, Orchestrator | Store actions |
| Selected node | LiminalWebSlice | DreamspaceCanvas, Orchestrator | `setSelectedNode` |
| Spatial layout mode | CoreSlice | Everyone | `setSpatialLayout` |
| Ephemeral nodes | CoreSlice | EphemeralNodeManager | Spawn/despawn actions |
| Ring assignments | Orchestrator ref | Orchestrator only | Layout methods |
| Pending movements | Orchestrator ref | Orchestrator only | `moveNode` |

---

## 9. Coordination Hacks (to be eliminated)

These exist to work around coordination issues:

1. **`nodeToReturnToConstellation`** - Captures previous center at click time to avoid race condition
2. **100ms delay before flip** - Let focus animation start before flipping
3. **Despawn queue stagger** - Prevent main thread block from bulk unmount
4. **`previousFlippedNodeId` tracking** - Try to remember who was flipped before state change

---

## 10. Identified Gaps

### Missing Primitives
1. **Batch command execution** - Issue multiple commands atomically
2. **Animation cancellation token** - Clean way to cancel in-flight animations
3. **Layout transition state** - Know when all nodes have settled
4. **Command acknowledgment** - Know when a command has been executed

### Unclear Ownership
1. **Who decides flip timing?** - Currently scattered between DreamspaceCanvas, DreamNode3D, Orchestrator
2. **Who owns holarchy mode detection?** - Currently computed in multiple places
3. **Who decides ring membership?** - Orchestrator computes, but doesn't persist

---

## Summary Statistics

| Category | Count |
|----------|-------|
| DreamNode3D movement methods | 6 |
| DreamNode3D query methods | 2 |
| Store actions (node-related) | ~15 |
| SpatialOrchestrator methods | ~15 |
| Easing functions | 5 |
| Layout states | 7 |
| Position modes | 2 |
| Transition types | 4 |
| **Total primitives** | ~50 core operations |

---

*Generated: 2026-02-03*
*Purpose: Foundation for orchestration architecture refactor*
