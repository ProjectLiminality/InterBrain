// DreamNode feature barrel export
// The fundamental unit: types, services, and visualization components

// Store (state management)
export * from './store/slice';

// Commands
export { registerDreamNodeCommands } from './commands';

// Types
export * from './types/dreamnode';

// Services (orchestrators with state)
export { GitDreamNodeService } from './services/git-dreamnode-service';
export { UDDService } from './services/udd-service';
export { MediaLoadingService, getMediaLoadingService } from './services/media-loading-service';

// Utilities (stateless functions)
// git-utils: Git command wrappers
export * as gitUtils from './utils/git-utils';
// vault-scanner: Filesystem discovery
export * as vaultScanner from './utils/vault-scanner';
// repo-initializer: Repository creation
export * as repoInitializer from './utils/repo-initializer';
// title-sanitization: Title to folder name conversion
export { sanitizeTitleToPascalCase } from './utils/title-sanitization';
// Legacy class - kept for backward compatibility
export { GitOperationsService } from './utils/git-operations';

// Components
export { default as DreamNode3D } from './components/DreamNode3D';
export type { DreamNode3DRef } from './components/DreamNode3D';
export { DreamTalkSide } from './components/DreamTalkSide';
export { DreamSongSide } from './components/DreamSongSide';
export { PDFPreview } from './components/PDFPreview';

// Styles
export * from './styles/dreamNodeStyles';
