# Liminal Web Layout Feature

**Purpose**: Manages spatial positioning and relationship visualization for DreamNodes in 3D space.

## Core Functionality

This feature implements the "Liminal Web" layout system - a hexagonal ring-based positioning algorithm that arranges DreamNodes in concentric circles based on their relationships. It handles node selection, navigation history, and bidirectional relationship synchronization.

## Key Files

### `RingLayout.ts` (745 lines)
**Core positioning algorithm** - Calculates 3D positions for up to 42 nodes in a precise hexagonal coordinate system:
- **Center position**: Focused/selected node
- **Ring 1**: 6 nodes (inner ring)
- **Ring 2**: 12 nodes (middle ring)
- **Ring 3**: 18-24 nodes (outer ring)
- Uses boolean masking for exact node placement at different counts
- Implements priority mapping to position related nodes in inner rings
- Exports: `calculateRingLayoutPositions()`, `calculateRingLayoutPositionsForSearch()`, `DEFAULT_RING_CONFIG`

### `relationship-graph.ts` (169 lines)
**In-memory graph database** - Fast relationship traversal and queries:
- `buildRelationshipGraph()`: Constructs graph from DreamNode array with edge validation
- `getConnections()`: First-degree connections
- `getOppositeTypeConnections()`: Dreams ↔ Dreamers only (filters by type)
- `getSecondDegreeConnections()`: Connections of connections
- Exports: `RelationshipGraph` interface, utility functions for debugging

### `liminal-web-slice.ts` (272 lines)
**State management** - Zustand slice for selected node and navigation history:
- `selectedNode`: Currently focused DreamNode in liminal web view
- `navigationHistory`: Undo/redo stack (150 max entries) with flip state and scroll position
- `setSelectedNode()`: Updates selection and triggers lazy media loading for node neighborhood
- `performUndo()`, `performRedo()`: Navigate through history
- `restoreVisualState()`: Restores flip state and scroll position from history entry
- Exports: `LiminalWebSlice` interface, `createLiminalWebSlice` creator

### `relationship-commands.ts` (437 lines)
**Git-based relationship utilities** - Command palette commands for relationship maintenance:
- `syncBidirectionalRelationships()`: Ensures if A→B then B→A, auto-links dreamers to InterBrain anchor node
- `cleanDanglingRelationships()`: Removes references to non-existent nodes
- Both commands commit changes to `.udd` files with git, rescan vault, and show user notices
- Exports: `registerRelationshipCommands()`

### `index.ts` (11 lines)
**Barrel export** - Re-exports all public APIs from the feature

## Main Exports

```typescript
// Layout calculation
calculateRingLayoutPositions(focusedNodeId, relationshipGraph, config)
calculateRingLayoutPositionsForSearch(orderedNodes, relationshipGraph, config)
DEFAULT_RING_CONFIG

// Relationship graph
buildRelationshipGraph(dreamNodes)
RelationshipGraph interface

// State management
createLiminalWebSlice (Zustand slice creator)
LiminalWebSlice interface

// Commands
registerRelationshipCommands(plugin)
```

## Dependencies

- **Core**: `interbrain-store` (Zustand state), `service-manager`, DreamNode types
- **External**: Obsidian Plugin API (for commands), Node.js fs/path/child_process (for git operations)
- **Feature**: `dreamweaving` (for scroll position persistence)

## Integration Points

- Used by `DreamSpace` component to position nodes in 3D
- Integrated with semantic search to prioritize related nodes in search results
- Connects to media loading service for lazy loading node neighborhoods
- Commands registered in plugin's `main.ts` for relationship maintenance

## Technical Notes

- **Coordinate system**: Y-axis is negated to convert from HTML canvas (Y-down) to 3D (Y-up)
- **42-node capacity**: Maximum layout capacity across all rings (6+12+24)
- **Priority mapping**: Related nodes (with golden glow) always get inner ring positions
- **Navigation history**: Stores flip state and scroll position for seamless undo/redo
- **Git integration**: Relationship sync directly commits `.udd` changes with proper diff checking

## No Issues Detected

All files are actively used and well-integrated with the broader system. No dead code or removal candidates identified.
