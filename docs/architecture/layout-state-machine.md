# Layout State Machine

This document defines the canonical state machine for spatial layout orchestration.

## Design Principles

1. **All transitions are commands**: Every UI interaction (click, escape, button) triggers an Obsidian command. The command is what matters, not the UI surface that triggered it.

2. **Minimal state definition**: Each layout state is defined by the minimum data needed to uniquely identify it. Everything else is derived.

3. **Escape always rolls back**: Pressing escape moves one step back toward constellation mode. Spamming escape always lands you in constellation.

4. **Path to constellation**: All roads lead back to constellation mode, which is the foundational/bedrock layout.

---

## Layout States (Definition Layer)

### CONSTELLATION

The bedrock layout. Persistent nodes at their anchor positions on the Fibonacci sphere.

**Defining data:**
- `sphereRotation: Quaternion` (current rotation of the constellation sphere)

**Characteristics:**
- Persistent nodes know their anchor/home positions (star positions on sphere)
- Dynamic view scaling: offset toward camera calculated every frame based on sphere rotation
- Real-time interaction (drag to rotate, momentum physics) - NOT quantized state transitions
- Entry INTO constellation is quantized (escape key, etc.); behavior WITHIN is real-time

**Special behavior:**
- When transitioning TO constellation from a layout with a centered persistent node, the sphere should animate its rotation such that the previously centered node ends up in the center of the field of view
- This reveals the "siblings" (nearby constellation nodes) of the previously focused node

---

### LIMINAL_WEB

The primary navigation UI. A centered node with related nodes of the opposite type in rings around it.

**Defining data:**
- `centerId: string` (the focused node)
- `centerFlipSide: 'front'` (must be front for liminal web)

**Derived data:**
- Ring nodes: nodes of opposite type related to center (Dreams ↔ Dreamers)
- Ring order: determined by activity-based priority system
- Ring positions: calculated by ring layout algorithm

**Characteristics:**
- Works reflexively for both node types:
  - Dream centered → Dreamers in ring
  - Dreamer centered → Dreams in ring
- Clicking a ring node → LIMINAL_WEB with that node as new center
- Flipping a Dream node → transitions to HOLARCHY
- Dreamer nodes cannot be flipped (flip button disabled, no back side)

---

### HOLARCHY

Vertical navigation through the DreamNode holarchy. Only applies to Dream nodes (not Dreamers).

**Defining data:**
- `centerId: string` (the focused Dream node)
- `centerFlipSide: 'back'` (must be back for holarchy)

**Derived data:**
- Ring nodes: supermodules of the centered node (from UDD)
- Submodules: displayed INSIDE the centered node (HTML component, not orchestrated)

**Characteristics:**
- Center node shows back side (submodules inside, DreamTalk hidden)
- Ring shows supermodules (all displaying their FRONT side)
- Clicking a supermodule → HOLARCHY with that node as new center (it flips to back)
- Clicking a submodule → HOLARCHY with that node as new center (it flips to back)
- Flipping center to front → transitions to LIMINAL_WEB

**Note:** Submodule orchestration is handled by the DreamSongSide HTML component, not the spatial orchestrator. The orchestrator only places supermodules in the ring.

---

### SEARCH

Search results displayed in rings around a search node.

**Defining data:**
- `query: string` (the search query)

**Derived data:**
- Ring nodes: search results (fuzzy + semantic search combined)
- Ring order: by relevance score

**Characteristics:**
- Triggered by Ctrl+F from any state
- First transitions to CONSTELLATION, then to SEARCH
- Search node component in center (query input where title would be)
- Escape → CONSTELLATION

---

### EDIT_METADATA

Overlay for editing a node's metadata (title, DreamTalk media, etc.).

**Defining data:**
- `targetNodeId: string` (the node being edited)
- `returnToState: LIMINAL_WEB` (always returns to liminal web)

**Characteristics:**
- Accessed via action button (edit metadata command) from LIMINAL_WEB
- If triggered from HOLARCHY: first transition to LIMINAL_WEB, then enter EDIT_METADATA
- Edit node component overlays the centered node
- Ring nodes remain unchanged (frozen in place)
- Cancel or Save → returns to LIMINAL_WEB
- Escape → returns to LIMINAL_WEB

---

### EDIT_RELATIONSHIP

Edit mode for managing liminal web relationships.

**Defining data:**
- `targetNodeId: string` (the node whose relationships are being edited)
- `pendingRelations: string[]` (ephemeral buffer of nodes to potentially add)
- `searchQuery: string` (current filter for pulling in candidates)

**Characteristics:**
- Accessed via action button (edit relationship command) from LIMINAL_WEB
- If triggered from HOLARCHY: first transition to LIMINAL_WEB, then enter EDIT_RELATIONSHIP
- All related nodes enter permanent hover state (darkened, title visible)
- Search bar available; typing pulls in search results (opposite type, excluding already-related)
- Search results appended below currently-related nodes in ring
- Clicking a search result: adds to pendingRelations, enters hover state, moves up in list
- Clearing search: search results disappear, but clicked ones remain in pendingRelations
- Save: writes pendingRelations to disk (liminal-web.json)
- Cancel: discards pendingRelations
- Escape → returns to LIMINAL_WEB (discards changes)

**Future extension:** EDIT_HOLARCHY mode for managing sub/supermodule relationships, triggered from HOLARCHY mode. Same pattern, different relationship type and storage.

---

### COPILOT

Conversational AI mode with a Dreamer node as the "conversation partner". Real-time transcription feeds semantic search to surface relevant Dreams.

**Defining data:**
- `conversationPartnerId: string` (the Dreamer node at center)
- `optionKeyHeld: boolean` (whether Option key is currently pressed)
- `frozenSearchResults: string[]` (snapshot of semantic search results when Option was pressed)

**Derived data (background, continuous):**
- `liveSearchResults: string[]` - semantic search results based on sliding window of transcription buffer
- Only Dreams (opposite type of centered Dreamer)
- Ordered by semantic similarity to recent conversation
- Has relevance cutoff threshold

**Characteristics:**
- Accessed via "Initiate Digital Campfire" action button on a Dreamer in LIMINAL_WEB
- Center Dreamer stays frozen throughout (front side, stationary)
- Ring is normally empty (no nodes visible)
- When Option key pressed: `frozenSearchResults` captures current `liveSearchResults`, Dreams appear in ring
- While Option held: ring stays frozen even if `liveSearchResults` updates in background
- When Option released: ring nodes immediately fly home (disappear), `frozenSearchResults` cleared
- Clicking a ring node: "invokes" it (opens DreamSong content), stays in COPILOT mode
- Exit ONLY via "Extinguish Digital Campfire" button → returns to LIMINAL_WEB
- Escape key: blocked (no effect)
- Ctrl+F: blocked (no effect)
- All other navigation: blocked

**Search distinction:**
- SEARCH mode: fuzzy + semantic combined
- EDIT_RELATIONSHIP: fuzzy only (user knows the name)
- COPILOT: semantic only (content relevance to conversation)

---

## State Hierarchy

```
CONSTELLATION (bedrock)
    │
    │ click(nodeId)
    ▼
LIMINAL_WEB (primary navigation)
    │
    ├── flip(Dream node) ──► HOLARCHY
    │                            │
    │                            ├── click(supermodule) ──► HOLARCHY (new center)
    │                            ├── click(submodule) ──► HOLARCHY (new center)
    │                            ├── flip(center) ──► LIMINAL_WEB
    │                            ├── edit metadata cmd ──► LIMINAL_WEB ──► EDIT_METADATA
    │                            ├── edit relationship cmd ──► LIMINAL_WEB ──► EDIT_RELATIONSHIP
    │                            └── escape ──► LIMINAL_WEB
    │
    ├── click(ring node) ──► LIMINAL_WEB (new center)
    │
    ├── edit metadata cmd ──► EDIT_METADATA
    │                            └── escape/save/cancel ──► LIMINAL_WEB
    │
    ├── edit relationship cmd ──► EDIT_RELATIONSHIP
    │                                 └── escape/save/cancel ──► LIMINAL_WEB
    │
    ├── initiate campfire (Dreamer) ──► COPILOT
    │                                       │
    │                                       ├── Option hold ──► show frozen results in ring
    │                                       ├── Option release ──► hide ring
    │                                       ├── click(ring node) ──► invoke node (stay in COPILOT)
    │                                       └── extinguish campfire ──► LIMINAL_WEB
    │
    └── escape ──► CONSTELLATION

SEARCH (accessible from CONSTELLATION, LIMINAL_WEB, HOLARCHY via Ctrl+F)
    └── escape ──► CONSTELLATION
```

---

## Transition Table

| From | Event | Condition | To |
|------|-------|-----------|-----|
| CONSTELLATION | click(nodeId) | - | LIMINAL_WEB(center=nodeId, flip=front) |
| CONSTELLATION | Ctrl+F | - | SEARCH |
| CONSTELLATION | escape | - | no-op |
| LIMINAL_WEB | click(nodeId) | nodeId == center | no-op |
| LIMINAL_WEB | click(nodeId) | nodeId in ring | LIMINAL_WEB(center=nodeId, flip=front) |
| LIMINAL_WEB | flip(center) | center is Dream | HOLARCHY(center=same, flip=back) |
| LIMINAL_WEB | flip(center) | center is Dreamer | N/A (flip button disabled for Dreamers) |
| LIMINAL_WEB | edit metadata cmd | - | EDIT_METADATA(target=center) |
| LIMINAL_WEB | edit relationship cmd | - | EDIT_RELATIONSHIP(target=center) |
| LIMINAL_WEB | initiate campfire | center is Dreamer | COPILOT(partner=center) |
| LIMINAL_WEB | initiate campfire | center is Dream | N/A (campfire button only on Dreamers) |
| LIMINAL_WEB | Ctrl+F | - | SEARCH |
| LIMINAL_WEB | escape | - | CONSTELLATION (with sphere rotation to keep center visible) |
| HOLARCHY | click(nodeId) | nodeId == center | no-op |
| HOLARCHY | click(nodeId) | nodeId is supermodule | HOLARCHY(center=nodeId, flip=back) |
| HOLARCHY | click(nodeId) | nodeId is submodule | HOLARCHY(center=nodeId, flip=back) |
| HOLARCHY | flip(center) | - | LIMINAL_WEB(center=same, flip=front) |
| HOLARCHY | click(empty space) | - | LIMINAL_WEB(center=same, flip=front) |
| HOLARCHY | edit metadata cmd | - | LIMINAL_WEB → EDIT_METADATA |
| HOLARCHY | edit relationship cmd | - | LIMINAL_WEB → EDIT_RELATIONSHIP |
| HOLARCHY | Ctrl+F | - | SEARCH |
| HOLARCHY | escape | - | LIMINAL_WEB(center=same, flip=front) |
| SEARCH | click(nodeId) | - | LIMINAL_WEB(center=nodeId, flip=front) |
| SEARCH | escape | - | CONSTELLATION |
| EDIT_METADATA | save | - | LIMINAL_WEB |
| EDIT_METADATA | cancel | - | LIMINAL_WEB |
| EDIT_METADATA | escape | - | LIMINAL_WEB |
| EDIT_RELATIONSHIP | save | - | LIMINAL_WEB |
| EDIT_RELATIONSHIP | cancel | - | LIMINAL_WEB |
| EDIT_RELATIONSHIP | escape | - | LIMINAL_WEB |
| COPILOT | Option press | - | show frozenSearchResults in ring |
| COPILOT | Option release | - | hide ring (nodes fly home) |
| COPILOT | click(nodeId) | Option held, nodeId in ring | invoke node (stay in COPILOT) |
| COPILOT | extinguish campfire | - | LIMINAL_WEB(center=partner, flip=front) |
| COPILOT | escape | - | no-op (blocked) |
| COPILOT | Ctrl+F | - | no-op (blocked) |
| COPILOT | click(empty space) | - | no-op (blocked) |

---

## Commands (Transition Triggers)

All transitions are triggered by Obsidian commands. The UI is just one way to invoke these commands.

| Command | Parameters | Description |
|---------|------------|-------------|
| `select-node` | nodeId | Transition to LIMINAL_WEB with this node centered |
| `flip-node` | nodeId | Toggle flip state of node (triggers LIMINAL_WEB ↔ HOLARCHY if Dream) |
| `return-to-constellation` | - | Escape to CONSTELLATION |
| `open-search` | - | Transition to SEARCH |
| `edit-node-metadata` | nodeId | Enter EDIT_METADATA for this node |
| `edit-node-relationships` | nodeId | Enter EDIT_RELATIONSHIP for this node |
| `navigate-holarchy` | nodeId | Select node in HOLARCHY mode (flip to back) |

---

## Constellation: The Anomaly

Constellation mode has unique characteristics that don't fit the quantized state machine pattern:

**What fits the state machine:**
- Entry transition (escape from other modes)
- Exit transition (click a node)
- Sphere rotation as a parameter (for "return with centered node visible" feature)

**What doesn't fit (real-time, every-frame):**
- Dynamic view scaling (offset toward camera based on rotation)
- Drag-to-rotate interaction with momentum physics
- Continuous sphere rotation while dragging

**Design decision:** The state machine handles transitions INTO and OUT OF constellation. Once IN constellation, a separate real-time system handles the continuous interaction. The two systems interface at:
- Entry: state machine sets initial sphere rotation (to keep previous center visible)
- Exit: click event triggers state machine transition to LIMINAL_WEB

---

## Flip State Clarification

**Current implementation:** `isFlipped: boolean` (true/false)

**Target implementation:** `flipSide: 'front' | 'back'`

This is more readable and aligns with the state machine language.

---

## Resolved Questions

1. **Dreamer flip button:** **DISABLED.** Remove flip button from Dreamer nodes entirely. Dreamers don't participate in holarchy (no sub/supermodules). The DreamSong side is also disabled for Dreamers - they only have a front side. This can be re-enabled in the future if we find a good reason.

2. **Click empty space in HOLARCHY:** **Returns to LIMINAL_WEB.** Same as escape key - clicking empty space transitions back to liminal web (flips center to front). Constellation is only reachable through liminal web.

3. **HOLARCHY from Dreamer:** **Not possible.** Since flip button is disabled for Dreamers, this case doesn't exist.

---

## History System

The history system tracks intentional navigation actions for undo (Cmd+Z) support.

**What IS tracked:**
- Node selections (click on node → LIMINAL_WEB)
- Flip state changes (flip → LIMINAL_WEB ↔ HOLARCHY)
- Transitions to CONSTELLATION (with optional focusNodeId)

**What is NOT tracked:**
- EDIT_METADATA mode (ephemeral overlay)
- EDIT_RELATIONSHIP mode (ephemeral overlay)
- SEARCH mode (ephemeral, only the resulting node selection is tracked)
- COPILOT mode (ephemeral, intentional exit only via campfire button)
- Future EDIT_HOLARCHY mode

**History entry structure:**
```typescript
interface HistoryEntry {
  nodeId: string | null;      // Selected node (null for unfocused constellation)
  flipSide: 'front' | 'back'; // Flip state of the selected node
}
```

**Key insight:** The history doesn't need to explicitly track "liminal web" vs "holarchy" - it just tracks nodeId + flipSide. The layout mode is derived:
- `flipSide === 'front'` → LIMINAL_WEB
- `flipSide === 'back'` → HOLARCHY (only possible for Dreams)
- `nodeId === null` → CONSTELLATION

**Undo behavior:**
- Cmd+Z pops the previous entry and restores that state
- If previous was flipped to back → restores HOLARCHY
- If previous was flipped to front → restores LIMINAL_WEB
- If previous was null → restores CONSTELLATION

---

## Constellation Focus Parameter

CONSTELLATION can optionally have a `focusNodeId` that determines the initial sphere rotation:

**Defining data (extended):**
- `focusNodeId: string | null` (optional: node to center in view)
- `sphereRotation: Quaternion` (derived from focusNodeId + fixed constraint, OR free if no focus)

**Deriving rotation from focusNodeId:**
- The node's anchor position determines one axis (camera looks at this point)
- This leaves one degree of freedom (rotation around the camera's forward axis)
- We fix this with an arbitrary constraint (e.g., "up" is always toward +Y in world space)
- This makes the rotation fully deterministic from just the nodeId

**When focusNodeId is provided:**
- Sphere animates to rotation that centers this node
- Useful for "return to constellation while keeping context"

**When focusNodeId is null:**
- Sphere rotation is free / unchanged from last position
- Used when entering constellation from ephemeral node or fresh start

---

---

# Derivation Layer

The derivation layer specifies how to compute the full orchestration data from minimal state + context.

## The Derivation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  MINIMAL STATE (from Definition Layer)                                      │
│  e.g., { centerId: "abc123", flipSide: "front" }                           │
│                                                                             │
│                              +                                              │
│                                                                             │
│  CONTEXT (from store/services)                                              │
│  - Relationship data (liminal-web.json, UDD files)                         │
│  - Activity scores (per-node, self-contained)                              │
│  - Node metadata (type: Dream/Dreamer, anchor positions)                   │
│                                                                             │
│                              ↓                                              │
│                                                                             │
│  DERIVE: computeLayoutIntent(minimalState, context)                        │
│                                                                             │
│                              ↓                                              │
│                                                                             │
│  LAYOUT INTENT (full orchestration data)                                   │
│  {                                                                          │
│    center: { nodeId, position, flipSide },                                 │
│    ringNodes: [ { nodeId, position, flipSide: 'front' }, ... ],            │
│    homeNodes: [ nodeId, ... ]  // nodes to send home                       │
│  }                                                                          │
│                                                                             │
│                              ↓                                              │
│                                                                             │
│  DISPATCH: executeLayoutIntent(intent)                                     │
│  - For each node: setTargetState(target)                                   │
│  - Nodes animate themselves                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Derivation by Layout State

### CONSTELLATION

**Input:** `{ focusNodeId: string | null }`

**Derivation:**
1. If `focusNodeId` is provided and node is persistent:
   - Look up node's anchor position on Fibonacci sphere
   - Compute target sphere rotation that centers this position in camera view
   - Apply "up = +Y" constraint to fix remaining degree of freedom
2. If `focusNodeId` is null or node is ephemeral:
   - Keep current sphere rotation (no animation)

**Output:**
```typescript
{
  targetSphereRotation: Quaternion | null,  // null = no change
  homeNodes: string[]  // all currently active non-persistent nodes
}
```

**Note:** Ring nodes are not computed for constellation. All nodes are told to "go home" - each node knows what that means for itself:
- **Persistent nodes:** Fly to anchor position (dynamic view scaling determines final visual position)
- **Ephemeral nodes:** Travel out of field of view to hidden ring, then self-despawn

This is abstracted away - the orchestrator just says "go home" and each node handles it.

---

### LIMINAL_WEB

**Input:** `{ centerId: string, flipSide: 'front' }`

**Derivation:**
1. Look up center node's type (Dream or Dreamer)
2. Query relationships:
   - If Dream centered → get related Dreamers from liminal-web.json files
   - If Dreamer centered → get related Dreams from this Dreamer's liminal-web.json
3. Filter to opposite type only
4. Order by activity-based priority:
   - Each node has self-contained activity score
   - Sort descending by activity
5. Cap at ring capacity (36 nodes: 6 + 12 + 18)
6. Compute ring positions using ring layout algorithm
7. Identify nodes to send home (previously active, not in new layout)

**Output:**
```typescript
{
  center: { nodeId: string, position: [0, 0, -centerDistance], flipSide: 'front' },
  ringNodes: [
    { nodeId: string, position: [x, y, z], flipSide: 'front' },
    // ... up to 36 nodes
  ],
  homeNodes: string[]  // previously active nodes not in this layout
}
```

---

### HOLARCHY

**Input:** `{ centerId: string, flipSide: 'back' }`

**Derivation:**
1. Verify center node is type Dream (Dreamers cannot be in holarchy)
2. Read supermodules from center node's UDD file
3. Resolve supermodule identifiers to node IDs:
   - Primary: match by radicleId (canonical)
   - Fallback: match by UUID (legacy, acceptable for now)
   - ~~Last resort: match by name~~ (removed - too fragile)
4. Order supermodules by activity (same unified system as liminal web)
5. Cap at ring capacity (36 nodes)
6. Compute ring positions using ring layout algorithm
7. Identify nodes to send home (previously active, not in new layout)

**Output:**
```typescript
{
  center: { nodeId: string, position: [0, 0, -centerDistance], flipSide: 'back' },
  ringNodes: [
    { nodeId: string, position: [x, y, z], flipSide: 'front' },  // supermodules show front
    // ... up to 36 nodes
  ],
  homeNodes: string[]
}
```

**Note:** Submodules are NOT part of this derivation - they're handled internally by the DreamSongSide component.

---

### SEARCH

**Input:** `{ query: string }`

**Derivation:**
1. Run fuzzy search on node names/titles
2. Run semantic search on node content (via Ollama embeddings)
3. Combine and deduplicate results:
   - Fuzzy matches take priority over semantic-only matches
   - If a node appears in both, use the fuzzy result (higher confidence)
4. Order by relevance score
5. Cap at ring capacity (36 nodes)
6. Compute ring positions

**Output:**
```typescript
{
  center: null,  // search node component, not a DreamNode
  ringNodes: [
    { nodeId: string, position: [x, y, z], flipSide: 'front' },
    // ... search results
  ],
  homeNodes: string[]  // all previously active nodes
}
```

---

### EDIT_METADATA

**Input:** `{ targetNodeId: string }`

**Derivation:**
1. No spatial derivation needed - ring stays frozen
2. Just overlay edit component on center node

**Output:**
```typescript
{
  overlay: 'edit-metadata',
  targetNodeId: string,
  // No ring changes - keep current positions
}
```

---

### EDIT_RELATIONSHIP

**Input:** `{ targetNodeId: string, pendingRelations: string[], searchQuery: string }`

**Derivation:**
1. Get currently related nodes (from liminal-web.json)
2. If searchQuery non-empty:
   - Run **fuzzy search only** (not semantic - user knows what they're looking for by name)
   - Filter to opposite type
   - Exclude already-related nodes
   - Append to list after currently-related
3. Mark pendingRelations nodes as "selected" (for hover state)
4. Compute ring positions for combined list

**Output:**
```typescript
{
  center: { nodeId: string, position: [0, 0, -centerDistance], flipSide: 'front' },
  ringNodes: [
    { nodeId: string, position: [x, y, z], flipSide: 'front', isRelated: boolean, isPending: boolean },
    // ... currently related + search results
  ],
  overlay: 'edit-relationship',
  searchQuery: string
}
```

---

### COPILOT

**Input:** `{ conversationPartnerId: string, optionKeyHeld: boolean }`

**Background process (continuous, independent of derivation):**
- Real-time transcription feeds a sliding window buffer
- Semantic search runs against this buffer (Dreams only)
- Results stored in `liveSearchResults` with relevance cutoff applied
- This runs continuously regardless of `optionKeyHeld` state

**Derivation (triggered on Option key press):**
1. When Option pressed: capture snapshot of `liveSearchResults` → `frozenSearchResults`
2. Compute ring positions for `frozenSearchResults`
3. When Option released: clear ring (all nodes go home)

**Output (Option held):**
```typescript
{
  center: { nodeId: string, position: [0, 0, -centerDistance], flipSide: 'front' },  // Dreamer, frozen
  ringNodes: [
    { nodeId: string, position: [x, y, z], flipSide: 'front' },  // Dreams from frozenSearchResults
    // ... semantic search results (Dreams only)
  ],
  homeNodes: []  // nothing goes home while Option held
}
```

**Output (Option released):**
```typescript
{
  center: { nodeId: string, position: [0, 0, -centerDistance], flipSide: 'front' },  // Dreamer, frozen
  ringNodes: [],  // empty ring
  homeNodes: string[]  // all previous ring nodes fly home
}
```

**Note:** The center Dreamer never moves or changes throughout COPILOT mode. Only the ring content toggles based on Option key.

---

## Data Sources

### Relationship Data

**Liminal web relationships** (Dreams ↔ Dreamers):
- Stored in: `{DreamerNode}/liminal-web.json` (canonical)
- NOT in UDD file (any `liminalWeb` field in UDD is legacy code smell to remove)
- **Caching strategy:**
  - On refresh: parse all Dreamer directories at vault root (few hundred max, ~Dunbar number 150-500)
  - Build relationship graph from liminal-web.json files
  - Cache/store the graph for fast lookup
  - Only update what changed on subsequent refreshes
- Queried via: relationship graph service (from cache, not disk)

**Holarchy relationships** (sub/supermodules):
- Stored in: `{DreamNode}/.udd` → `submodules`, `supermodules` arrays
- Queried via: UDDService

### Activity Scores

**Philosophy:** Activity is personal UI state, NOT shared via Git. Each user manages their own activity universe.

**Storage:** Self-contained per node, in a separate UI-owned index (not on disk, not in Git)

**Algorithm (two-tier):**

1. **Primary: Collaboration activity**
   - For Dreamers: When did this Dreamer last make any change (commit, offer update) to ANY Dream in our universe?
   - For Dreams: When did ANY Dreamer last make any change to this Dream in our universe?
   - No distinction between your own changes vs peer contributions - all collaboration counts equally

2. **Secondary: Interaction activity (tiebreaker)**
   - How many times have we clicked on this node in the liminal web?
   - Timeframe: TBD (last week? all time? decaying?)

**Unified system:** Same logic applies to all node types and all list contexts:
- Dreamers in liminal web ring
- Dreams in liminal web ring
- Supermodules in holarchy ring
- Submodules (displayed differently, but ordered by same logic)

### Node Metadata

**Persisted (in UDD file):**
- Type: `'Dream' | 'Dreamer'`
- radicleId: canonical identifier for resolution

**Transient (in memory/store, not persisted):**
- Anchor position: for persistent nodes, their star position on constellation sphere
- Activity scores: collaboration activity, click counts
- Current visual state: position, flip progress, etc.

---

## Ring Layout Algorithm

Shared by all layouts that have ring nodes.

**Input:** Ordered list of node IDs + count

**Output:** Positions for each node in concentric rings

**Ring structure:**
- Ring 1 (inner): 6 nodes
- Ring 2 (middle): 12 nodes
- Ring 3 (outer): 18 nodes
- Total capacity: 36 nodes

**Algorithm:** `calculateRingLayoutPositions()` in `src/features/liminal-web-layout/RingLayout.ts`

**World rotation correction:** Positions are computed in local space, then corrected for current DreamWorld sphere rotation.

---

## Resolved Questions (Derivation Layer)

1. **Supermodule ordering:** **Activity-based**, same unified system as all other lists. Ordered by collaboration activity (commits), then by click interaction as tiebreaker.

2. **Activity score storage:** **Separate UI-owned index**, not on disk, not in Git. Personal to each user. DreamNode components own their own activity data in memory/store.

3. **Activity algorithm:** **Two-tier system.** Primary: collaboration activity (last commit time, treating own and peer contributions equally). Secondary: click interaction count in liminal web.

4. **Ring overflow:** **Truncate at 36** for now. Future enhancement to consider pagination or other solutions.

---

## Future Extensions

1. **EDIT_HOLARCHY mode:** Same pattern as EDIT_RELATIONSHIP but for managing sub/supermodule connections. Triggered from HOLARCHY mode.

2. **Re-enable Dreamer flip:** If we find a meaningful use for Dreamer back side, re-enable flip button and DreamSong side for Dreamers.
