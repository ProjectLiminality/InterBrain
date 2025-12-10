// DreamNode feature barrel export
// The fundamental unit: types, services, and visualization components

// Store (state management)
export * from './store/slice';

// Commands
export { registerDreamNodeCommands, revealContainingDreamNode, convertFolderToDreamNode } from './commands';

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
// media-validation: Single source of truth for supported DreamTalk media
export { isValidDreamTalkMedia, getMediaCategory, SUPPORTED_MEDIA_TYPES, SUPPORTED_EXTENSIONS } from './utils/media-validation';
// validation: Title validation for Creator and Editor
export { validateDreamNodeTitle, isTitleValid, type TitleValidationErrors } from './utils/validation';
// Legacy class - kept for backward compatibility
export { GitOperationsService } from './utils/git-operations';

// Components
export { default as DreamNode3D } from './components/DreamNode3D';
export type { DreamNode3DRef } from './components/DreamNode3D';
export { DreamTalkSide } from './components/DreamTalkSide';
export { DreamSongSide } from './components/DreamSongSide';
export { PDFPreview } from './components/PDFPreview';
// Shared UI components for Creator and Editor
export { DropZone, ValidationError } from './components/shared-ui';
export { NodeActionButton } from './components/NodeActionButton';

// Styles
export * from './styles/dreamNodeStyles';
