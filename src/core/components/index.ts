// Core components barrel export
export * from './DreamspaceView';
export * from './DreamspaceCanvas';
export * from './SpatialOrchestrator';

// Re-exports from feature modules for backwards compatibility
export * from '../../features/dreamnode';
export { Star3D, SphereRotationControls } from '../../features/constellation-layout';
export { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE, LinkFileView, LINK_FILE_VIEW_TYPE } from '../../features/dreamweaving';
