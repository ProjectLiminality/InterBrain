// Core module master barrel export
// Exports all core functionality for easy importing

// Types
export * from './types';

// Store
export * from './store';

// Utils
export * from './utils';

// Services
export * from './services';

// Layouts
export * from './layouts';

// Components (selective - not all components should be exported)
export { DreamspaceView, DREAMSPACE_VIEW_TYPE } from './components/DreamspaceView';
export { default as DreamspaceCanvas } from './components/DreamspaceCanvas';
export { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from './components/DreamSongFullScreenView';
export { LinkFileView, LINK_FILE_VIEW_TYPE } from './components/LinkFileView';

// Re-export DreamNode visualization components (now in feature)
export { DreamNode3D, DreamTalkSide, DreamSongSide, PDFPreview } from '../features/dreamnode-visualization';
export * from '../features/dreamnode-visualization/dreamNodeStyles';

// Hooks
export * from './hooks';

// Commands
export * from './commands';

// UI
// Note: Feature-specific modals moved to their respective features:
// - CoherenceBeaconModal -> features/coherence-beacon/ui/
// - UpdatePreviewModal -> features/updates/ui/
