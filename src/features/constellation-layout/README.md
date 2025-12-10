# Constellation Layout Feature

**Purpose**: Arranges DreamNodes on a 3D sphere surface using relationship-based clustering and force-directed algorithms, providing a "night sky" visualization with Apple Watch-style distance scaling and Google Earth-style rotation controls.

## Directory Structure

```
constellation-layout/
├── store/
│   └── slice.ts                  # Zustand slice for relationship graph, positions, config
├── components/
│   ├── ConstellationEdges.tsx    # Main container: renders all DreamSong threads
│   ├── DreamSongThread3D.tsx     # Groups edges from same DreamSong (unified interaction)
│   ├── Edge3D.tsx                # Spherical arc (great circle) between two nodes
│   ├── Star3D.tsx                # Pure visual star for night sky occlusion
│   └── SphereRotationControls.tsx # Virtual trackball with quaternion math and momentum
├── utils/
│   ├── Clustering.ts             # Connected components detection (DFS)
│   ├── Clustering.test.ts
│   ├── ClusterRefinement.ts      # Spring-mass simulation for overlap elimination
│   ├── ClusterRefinement.test.ts
│   ├── ForceDirected.ts          # Fruchterman-Reingold algorithm
│   ├── ForceDirected.test.ts
│   ├── SphericalProjection.ts    # Exponential map: 2D tangent → 3D sphere
│   ├── SphericalProjection.test.ts
│   ├── FibonacciSphereLayout.ts  # Golden ratio sphere distribution
│   ├── FibonacciSphereLayout.test.ts
│   ├── DynamicViewScaling.ts     # Apple Watch-style distance scaling
│   └── DynamicViewScaling.test.ts
├── assets/
│   └── star.png                  # Star image for night sky visualization
├── ConstellationLayout.ts        # Main orchestrator (calls utils pipeline)
├── LayoutConfig.ts               # Configuration types and defaults
├── types.ts                      # DreamSongRelationshipGraph, DreamSongNode, DreamSongEdge
├── commands.ts                   # Obsidian commands: scan vault, export JSON, show stats
├── index.ts                      # Barrel export
└── README.md
```

## Main Exports

```typescript
// Store (state management)
export { createConstellationSlice, ConstellationSlice } from './store/slice';
export type { ConstellationDataState } from './store/slice';

// Commands
export { ConstellationCommands, registerConstellationDebugCommands } from './commands';

// Components
export { default as ConstellationEdges } from './components/ConstellationEdges';
export { default as DreamSongThread3D } from './components/DreamSongThread3D';
export { default as Edge3D } from './components/Edge3D';
export { default as Star3D } from './components/Star3D';
export { default as SphereRotationControls } from './components/SphereRotationControls';

// Orchestrator
export { computeConstellationLayout, validateLayout, createFallbackLayout } from './ConstellationLayout';

// Utils (algorithms)
export { detectConnectedComponents, getClusterColor } from './utils/Clustering';
export { refineClusterPositions, hasClusterOverlaps } from './utils/ClusterRefinement';
export { computeClusterLayout } from './utils/ForceDirected';
export { exponentialMap, fibonacciSphere, geodesicDistance } from './utils/SphericalProjection';
export { calculateFibonacciSpherePositions, DEFAULT_FIBONACCI_CONFIG } from './utils/FibonacciSphereLayout';
export { calculateDynamicScaling, DEFAULT_SCALING_CONFIG } from './utils/DynamicViewScaling';

// Config & Types
export type { ConstellationLayoutConfig, ConstellationCluster, LayoutStatistics } from './LayoutConfig';
export type { DreamSongRelationshipGraph, DreamSongNode, DreamSongEdge } from './types';
```

## Algorithm Pipeline

1. **Scan Vault** → Extract relationships from DreamSong.canvas files
2. **Clustering** (`utils/Clustering.ts`) → Connected components using DFS
3. **Global Positioning** → Fibonacci sphere distribution for cluster centers
4. **Force-Directed** (`utils/ForceDirected.ts`) → Fruchterman-Reingold within clusters
5. **Spherical Projection** (`utils/SphericalProjection.ts`) → Exponential map from 2D tangent to 3D
6. **Refinement** (`utils/ClusterRefinement.ts`) → Spring-mass simulation for overlap elimination
7. **Store** → Persist positions + graph to Zustand (localStorage)

## Key Components

### `store/slice.ts` - State Management
Zustand slice managing:
- **constellationData**: Relationship graph, positions, node metadata, scan timestamps
- **fibonacciConfig**: Sphere layout configuration
- **debugWireframeSphere**, **debugIntersectionPoint**: Debug visualization flags
- Persistence serialization for localStorage caching

### `components/SphereRotationControls.tsx` - Rotation Controls
Google Earth-style virtual trackball:
- Quaternion mathematics (no gimbal lock)
- Physics-based momentum with exponential damping (325ms time constant)
- Velocity estimation with low-pass filtering
- Rotation locked when in liminal-web mode

### `utils/DynamicViewScaling.ts` - Distance-Based Scaling
Apple Watch-style scaling zones:
- **Inner radius (750)**: Center plateau - nodes at maximum size
- **Outer radius (2250)**: Transition zone with perspective-corrected scaling
- **Beyond outer**: Stars only (performance optimization)

## Utils Overview

| File | Algorithm | Purpose |
|------|-----------|---------|
| `Clustering.ts` | DFS graph traversal | Detect connected components |
| `ClusterRefinement.ts` | Spring-mass simulation | Push overlapping clusters apart |
| `ForceDirected.ts` | Fruchterman-Reingold | Arrange nodes within clusters |
| `SphericalProjection.ts` | Exponential/log maps | 2D ↔ 3D sphere projection |
| `FibonacciSphereLayout.ts` | Golden ratio spiral | Even point distribution |
| `DynamicViewScaling.ts` | Perspective correction | Distance-based sizing |

## Integration Points

- **DreamWeaving**: Uses `DreamSongRelationshipService` to scan vault
- **Spatial Orchestrator**: Applies computed positions to DreamNodes in 3D space
- **Zustand Store**: Reads/writes `constellationData` slice
- **Commands**: Exposed via Obsidian command palette

## Technical Notes

- **Spherical geometry**: Uses exponential/logarithmic maps (differential geometry)
- **Quaternion rotation**: No gimbal lock, smooth rotation at all orientations
- **36-node capacity**: Works seamlessly with liminal-web layout
- **Persistent state**: Graph + positions cached in Zustand/localStorage
- **Intelligent diff**: Only recomputes layout when relationships change
- **Performance**: Nodes at `radius: 5000` for proper night sky scale

## Test Coverage

All utility algorithms have comprehensive unit tests:
- `Clustering.test.ts` - Connected components, cluster colors
- `ClusterRefinement.test.ts` - Overlap detection, refinement
- `ForceDirected.test.ts` - Layout convergence, positioning
- `SphericalProjection.test.ts` - Exp/log maps, geodesic distance
- `FibonacciSphereLayout.test.ts` - Golden ratio distribution
- `DynamicViewScaling.test.ts` - Perspective-corrected scaling
