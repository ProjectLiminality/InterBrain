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

// Components (selective - not all components should be exported)
export { DreamspaceView, DREAMSPACE_VIEW_TYPE } from './components/DreamspaceView';
export { default as DreamspaceCanvas } from './components/DreamspaceCanvas';

// Re-exports from feature modules
export * from '../features/dreamnode';
export { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE, LinkFileView, LINK_FILE_VIEW_TYPE } from '../features/dreamweaving';

// Commands
export * from './commands';
