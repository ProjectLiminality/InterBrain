# Constellation Layout Feature

**3D spherical graph layout system with relationship-based clustering and dynamic view scaling for DreamNode visualization.**

## Purpose

Arranges DreamNodes on a sphere surface based on their DreamSong relationships, using force-directed algorithms and spherical geometry. Provides Apple Watch-style distance-based scaling and Google Earth-style rotation controls.

## Key Files

### Core Algorithm
- **`ConstellationLayout.ts`** - Main orchestrator: clustering → global positioning → force-directed → projection → refinement
- **`clustering.ts`** - Connected components detection using DFS for automatic cluster discovery
- **`ForceDirected.ts`** - Fruchterman-Reingold algorithm for relationship-aware node arrangement
- **`SphericalProjection.ts`** - Exponential map: 2D tangent plane → 3D sphere surface (geodesic math)
- **`ClusterRefinement.ts`** - Iterative spring-mass simulation to eliminate cluster overlaps
- **`LayoutConfig.ts`** - Configuration types and defaults (based on HTML prototype)

### Spatial Distribution
- **`FibonacciSphereLayout.ts`** - Golden ratio sphere distribution (baseline/fallback positioning)
- **`DynamicViewScaling.ts`** - Apple Watch-style distance-based scaling with perspective correction

### 3D Components
- **`Star3D.tsx`** - Pure visual star component for night sky occlusion
- **`Edge3D.tsx`** - Spherical arc (great circle) between two nodes on sphere
- **`DreamSongThread3D.tsx`** - Groups multiple edges from same DreamSong (unified interaction)
- **`ConstellationEdges.tsx`** - Main container: reads graph from store, renders all threads
- **`SphereRotationControls.tsx`** - Virtual trackball with quaternion math and momentum physics

### State & Commands
- **`constellation-slice.ts`** - Zustand slice: relationship graph, positions, node metadata, config
- **`commands.ts`** - Obsidian commands: scan vault, export JSON, show stats, apply layout
- **`types.ts`** - Core types: `DreamSongRelationshipGraph`, `DreamSongNode`, `DreamSongEdge`

### Misc
- **`index.ts`** - Barrel export for all constellation layout APIs

## Main Exports

```typescript
// Algorithm
export { computeConstellationLayout } from './ConstellationLayout';
export { detectConnectedComponents } from './clustering';
export { computeClusterLayout } from './ForceDirected';
export { exponentialMap, fibonacciSphere } from './SphericalProjection';

// Components
export { default as ConstellationEdges } from './ConstellationEdges';
export { default as Star3D } from './Star3D';
export { default as SphereRotationControls } from './SphereRotationControls';

// State
export { createConstellationSlice } from './constellation-slice';

// Commands
export { ConstellationCommands, registerConstellationDebugCommands } from './commands';
```

## Algorithm Pipeline

1. **Scan Vault** → Extract relationships from DreamSong.canvas files
2. **Detect Clusters** → Connected components using DFS (undirected graph)
3. **Global Positioning** → Place cluster centers on sphere (Fibonacci distribution)
4. **Local Layouts** → Force-directed within each cluster (Fruchterman-Reingold)
5. **Projection** → Exponential map from 2D tangent plane to 3D sphere surface
6. **Refinement** → Iterative spring-mass to eliminate overlaps
7. **Store** → Persist positions + graph to Zustand (localStorage)

## Architecture Notes

- **Based on HTML prototype** - All algorithms validated in prototype before implementation
- **Spherical geometry** - Uses exponential/logarithmic maps (differential geometry)
- **Quaternion rotation** - No gimbal lock, smooth rotation at all orientations
- **Persistent state** - Graph + positions cached in Zustand/localStorage
- **Intelligent diff** - Only recomputes layout when relationships actually change
- **Performance** - Nodes at `radius: 5000` for proper night sky scale

## Integration Points

- **DreamWeaving** - Uses `DreamSongRelationshipService` to scan vault
- **Spatial Orchestrator** - Applies computed positions to DreamNodes in 3D space
- **Zustand Store** - Reads/writes `constellationData` slice
- **Commands** - Exposed via Obsidian command palette

## Flags & Issues

### Dead Code
- **`clustering.ts`** - Functions `calculateClusterCenter()` and `calculateClusterRadius()` use placeholder random positions (will be replaced when positions are in store)

### Unused Exports
- **`ForceDirected.ts`** - `optimizeWithGradientDescent()` - Alternative optimization method (not currently used)
- **`ClusterRefinement.ts`** - `optimizeClusterDistribution()` - Simulated annealing approach (not currently used)

### Dependencies
- Depends on `../dreamnode` for `DreamNode` type
- Depends on `../dreamweaving` for `DreamSongRelationshipService`
- Depends on `../../core/store/interbrain-store` for state management

## Testing

- **`FibonacciSphereLayout.test.ts`** - Tests golden ratio distribution
- **`DynamicViewScaling.test.ts`** - Tests distance-based scaling math

No other tests yet (algorithms ported from validated HTML prototype).
