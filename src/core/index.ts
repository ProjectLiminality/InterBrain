// Core module master barrel export
// Exports all core functionality for easy importing

// Store
export * from './store';

// Services
export * from './services';

// Context
export { OrchestratorContext, useOrchestrator } from './context/orchestrator-context';

// Components (selective - not all components should be exported)
export { DreamspaceView, DREAMSPACE_VIEW_TYPE } from './components/DreamspaceView';
export { default as DreamspaceCanvas } from './components/DreamspaceCanvas';

// Re-exports from feature modules
export * from '../features/dreamnode';
export { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE, LinkFileView, LINK_FILE_VIEW_TYPE } from '../features/dreamweaving';

// Commands
export * from './commands';
