// Core components barrel export
export * from './DreamspaceView';
export * from './DreamspaceCanvas';
export * from './DreamSongFullScreenView';
export * from './SpatialOrchestrator';
export * from './SphereRotationControls';
export * from './LinkFileView';
export * from './InterBrainApp';

// Re-export DreamNode visualization components (now in feature)
export * from '../../features/dreamnode-visualization';

// Re-export Star3D from constellation-layout for backwards compatibility
export { Star3D } from '../../features/constellation-layout';
