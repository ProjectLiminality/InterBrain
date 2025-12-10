# Liminal Web Layout Feature

**Purpose**: Manages spatial positioning and relationship visualization for DreamNodes in 3D space using a hexagonal ring-based layout system.

## Directory Structure

```
liminal-web-layout/
├── store/
│   └── slice.ts              # Zustand slice for selected node and navigation history
├── RingLayout.ts             # Core 3D positioning algorithm (hexagonal rings)
├── relationship-graph.ts     # In-memory graph database for relationship queries
├── commands.ts               # Command palette commands for relationship maintenance
├── index.ts                  # Barrel export
└── README.md
```

## Main Exports

```typescript
// Store (state management)
export { createLiminalWebSlice, LiminalWebSlice } from './store/slice';
export type { NavigationHistoryEntry, NavigationHistoryState } from './store/slice';

// Layout algorithms
export { calculateRingLayoutPositions, calculateRingLayoutPositionsForSearch } from './RingLayout';
export { DEFAULT_RING_CONFIG } from './RingLayout';
export type { RingLayoutConfig, RingLayoutPositions } from './RingLayout';

// Relationship graph
export { buildRelationshipGraph, getRelationshipStats } from './relationship-graph';
export type { RelationshipGraph } from './relationship-graph';

// Commands
export { registerRelationshipCommands } from './commands';
```

## Key Components

### `store/slice.ts` - State Management
Zustand slice managing:
- **selectedNode**: Currently focused DreamNode in liminal web view
- **navigationHistory**: Undo/redo stack (150 max entries) with flip state
- **setSelectedNode()**: Updates selection and triggers lazy media loading for node neighborhood
- **performUndo()**, **performRedo()**: Navigate through history
- **restoreVisualState()**: Restores flip state from history entry

### `RingLayout.ts` - Positioning Algorithm
Calculates 3D positions for up to 36 nodes in hexagonal rings:
- **Center**: Focused/selected node
- **Ring 1**: 6 nodes (inner ring)
- **Ring 2**: 12 nodes (middle ring)
- **Ring 3**: 18 nodes (outer ring)

Uses boolean masking for precise node placement and priority mapping to position related nodes in inner rings.

### `relationship-graph.ts` - Graph Database
Fast in-memory relationship traversal:
- `buildRelationshipGraph()`: Constructs graph from DreamNode array
- `getConnections()`: First-degree connections
- `getOppositeTypeConnections()`: Dreams ↔ Dreamers only
- `getSecondDegreeConnections()`: Connections of connections

### `commands.ts` - Maintenance Commands
- **Clean Dangling Relationships**: Removes references to non-existent nodes from liminal-web.json files

## Integration Points

- Used by `DreamspaceCanvas` component for 3D node positioning
- Integrated with semantic search for prioritizing related nodes
- Connects to media loading service for lazy loading node neighborhoods
- Commands registered in plugin's `main.ts`

## Technical Notes

- **Coordinate system**: Y-axis is negated to convert from HTML canvas (Y-down) to 3D (Y-up)
- **36-node capacity**: Maximum layout capacity across all rings (6+12+18)
- **Priority mapping**: Related nodes always get inner ring positions
- **Lazy loading**: Selecting a node triggers media loading for its 2-degree neighborhood
