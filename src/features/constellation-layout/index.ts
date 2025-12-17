// Constellation Layout feature barrel export
// 3D visualization layout with relationship-based clustering, dynamic view scaling, and star rendering

// Store (state management)
export * from './store/slice';

// Commands
export { registerConstellationDebugCommands } from './commands';

// Components
export { default as ConstellationEdges, shouldShowConstellationEdges, useConstellationStats } from './components/ConstellationEdges';
export { default as DreamSongThread3D, groupEdgesByDreamSong, sortEdgesBySequence, extractDreamNodeIdFromPath } from './components/DreamSongThread3D';
export { default as Edge3D, isValidEdge, calculateArcMidpoint } from './components/Edge3D';
export { default as Star3D, STAR_GRADIENT } from './components/Star3D';
export { default as SphereRotationControls } from './components/SphereRotationControls';

// Orchestrator
export * from './ConstellationLayout';

// Utils (algorithms)
export * from './utils/Clustering';
export * from './utils/ClusterRefinement';
export * from './utils/ForceDirected';
export * from './utils/SphericalProjection';
export * from './utils/FibonacciSphereLayout';
export * from './utils/DynamicViewScaling';

// Config & Types
export * from './LayoutConfig';
export * from './types';
