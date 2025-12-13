# Ring Layout Algorithm

The InterBrain honeycomb ring layout algorithm is a mathematically precise system for positioning 1-36 nodes in three concentric hexagonal rings. This creates an optimal visual hierarchy for both liminal web relationships and semantic search results.

## Overview

The algorithm uses a **42-node coordinate system** with **intelligent selection patterns** to display up to 36 nodes across three rings:

- **Ring 1**: 1-6 nodes (center hexagon)
- **Ring 2**: 7-18 nodes (12 positions: 6 corners + 6 edge midpoints)  
- **Ring 3**: 19-36 nodes (24 positions from 42 total coordinates)

## Interactive Visualizer

**[🎯 Launch Interactive Ring Layout Visualizer](./ring-layout-visualizer.html)**

The visualizer demonstrates:
- **Dynamic positioning**: How 1-36 nodes are placed with perfect geometric precision
- **Coordinate system**: All 42 possible node positions
- **Selection patterns**: Which coordinates are used for different node counts
- **Visual hierarchy**: Distance-based scaling for optimal UX

## Key Features

### Equidistant Placement (1-6 nodes)
For small node counts, the algorithm uses trigonometric calculations to ensure perfect equidistant spacing:
```javascript
const angle = (i / nodeCount) * 2 * Math.PI + startAngle;
const x = radius * Math.cos(angle);
const y = radius * Math.sin(angle);
```

### Boolean Mask System (7-36 nodes)
For larger counts, a precise boolean mask selects optimal coordinates from the 42-position grid:
```javascript
const allPositions = generateAll42StaticPositions();
const activeMask = getActiveMask(totalNodes);
// Map nodes to selected positions based on mask
```

### Perspective Scaling
Three different distances create visual hierarchy:
- **Ring 1**: 100 units (closest, largest)
- **Ring 2**: 200 units (medium distance)
- **Ring 3**: 450 units (furthest, smallest)

## Technical Implementation

The algorithm is implemented in `../RingLayout.ts` with these key functions:

- `calculateRingLayoutPositions()` - Main positioning function for liminal web mode
- `calculateRingLayoutPositionsForSearch()` - Search results positioning  
- `generateAll42StaticPositions()` - Complete coordinate system generation
- `getActiveMask()` - Boolean selection patterns for each node count

## Usage Modes

### Liminal Web Mode
Displays relationship connections around a focused node:
```typescript
const positions = calculateRingLayoutPositions(focusedNodeId, relationshipGraph);
```

### Search Mode  
Shows semantic search results ordered by relevance:
```typescript
const positions = calculateRingLayoutPositionsForSearch(searchResults, relationshipGraph);
```

## Mathematical Foundations

The algorithm leverages:
- **Golden ratio geometry**: Hexagonal patterns for natural visual flow
- **Flower of Life principles**: Sacred geometry for intuitive positioning
- **Trigonometric precision**: Exact angle calculations for perfect symmetry
- **Path parameterization**: Linear interpolation for edge node positioning

## Performance

- **O(1) positioning**: Constant-time coordinate lookup
- **Zero recalculation**: Pre-computed static positions
- **Smooth animations**: Universal Movement API integration
- **Scalable**: Handles 1-36 nodes with identical performance

---

*This algorithm powers both the liminal web relationship visualization and semantic search result display in the InterBrain spatial interface.*