# Constellation Layout Feature

**Purpose**: Arranges DreamNodes on a 3D sphere surface using relationship-based clustering and force-directed algorithms, providing a "night sky" visualization with Apple Watch-style distance scaling and Google Earth-style rotation controls.

## Directory Structure

```
constellation-layout/
├── store/
│   └── slice.ts              # Zustand slice for relationship graph, positions, config
├── components/
│   ├── ConstellationEdges.tsx    # Main container: renders all DreamSong threads
│   ├── DreamSongThread3D.tsx     # Groups edges from same DreamSong (unified interaction)
│   ├── Edge3D.tsx                # Spherical arc (great circle) between two nodes
│   ├── Star3D.tsx                # Pure visual star for night sky occlusion
│   └── SphereRotationControls.tsx # Virtual trackball with quaternion math and momentum
├── assets/
│   └── star.png              # Star image for night sky visualization
├── ConstellationLayout.ts    # Main orchestrator: clustering → positioning → projection
├── clustering.ts             # Connected components detection using DFS
├── ForceDirected.ts          # Fruchterman-Reingold algorithm for node arrangement
├── SphericalProjection.ts    # Exponential map: 2D tangent plane → 3D sphere surface
├── ClusterRefinement.ts      # Iterative spring-mass simulation for overlap elimination
├── LayoutConfig.ts           # Configuration types and defaults
├── FibonacciSphereLayout.ts  # Golden ratio sphere distribution (baseline/fallback)
├── DynamicViewScaling.ts     # Apple Watch-style distance-based scaling
├── types.ts                  # DreamSongRelationshipGraph, DreamSongNode, DreamSongEdge
├── commands.ts               # Obsidian commands: scan vault, export JSON, show stats
├── index.ts                  # Barrel export
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
export { default as ConstellationEdges, shouldShowConstellationEdges } from './components/ConstellationEdges';
export { default as DreamSongThread3D } from './components/DreamSongThread3D';
export { default as Edge3D } from './components/Edge3D';
export { default as Star3D } from './components/Star3D';
export { default as SphereRotationControls } from './components/SphereRotationControls';

// Layout algorithms
export { computeConstellationLayout, validateLayout, createFallbackLayout } from './ConstellationLayout';
export { detectConnectedComponents, getClusterColor } from './clustering';
export { computeClusterLayout } from './ForceDirected';
export { exponentialMap, fibonacciSphere, geodesicDistance } from './SphericalProjection';
export { refineClusterPositions } from './ClusterRefinement';
export { calculateFibonacciSpherePositions, DEFAULT_FIBONACCI_CONFIG } from './FibonacciSphereLayout';
export { calculateDynamicScaling, DEFAULT_SCALING_CONFIG } from './DynamicViewScaling';

// Types
export type { DreamSongRelationshipGraph, DreamSongNode, DreamSongEdge } from './types';
export type { ConstellationLayoutConfig, ConstellationCluster, LayoutStatistics } from './LayoutConfig';
```

## Algorithm Pipeline

1. **Scan Vault** → Extract relationships from DreamSong.canvas files
2. **Detect Clusters** → Connected components using DFS (undirected graph)
3. **Global Positioning** → Place cluster centers on sphere (Fibonacci distribution)
4. **Local Layouts** → Force-directed within each cluster (Fruchterman-Reingold)
5. **Projection** → Exponential map from 2D tangent plane to 3D sphere surface
6. **Refinement** → Iterative spring-mass to eliminate overlaps
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

### `DynamicViewScaling.ts` - Distance-Based Scaling
Apple Watch-style scaling zones:
- **Inner radius (750)**: Center plateau - nodes at maximum size
- **Outer radius (2250)**: Transition zone with perspective-corrected scaling
- **Beyond outer**: Stars only (performance optimization)

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

## Testing

- **`FibonacciSphereLayout.test.ts`** - Golden ratio distribution
- **`DynamicViewScaling.test.ts`** - Distance-based scaling math
