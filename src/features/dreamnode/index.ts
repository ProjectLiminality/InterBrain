// DreamNode feature barrel export
// The fundamental unit: types, services, and visualization components

// Types
export * from './types/dreamnode';

// Services
export { DreamNodeService } from './services/dreamnode-service';
export { GitDreamNodeService } from './services/git-dreamnode-service';
export { UDDService } from './services/udd-service';
export { MediaLoadingService, getMediaLoadingService } from './services/media-loading-service';
export { GitOperationsService } from './services/git-operations';
export { GitTemplateService } from './services/git-template-service';

// Components
export { default as DreamNode3D } from './components/DreamNode3D';
export type { DreamNode3DRef } from './components/DreamNode3D';
export { DreamTalkSide } from './components/DreamTalkSide';
export { DreamSongSide } from './components/DreamSongSide';
export { PDFPreview } from './components/PDFPreview';

// Styles
export * from './styles/dreamNodeStyles';
