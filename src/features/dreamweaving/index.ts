// Dreamweaving feature exports
// Transforms Obsidian canvas files into DreamSong story flows and manages git submodule relationships

// Store (state management)
// Note: slice re-exports some relationship types for backward compatibility
export {
  createDreamweavingSlice,
  DreamweavingSlice,
  DreamSongCacheEntry,
  DreamSongRelationshipState,
  INITIAL_DREAMSONG_RELATIONSHIP_STATE,
  getDreamSongScrollPosition,
  restoreDreamSongScrollPosition,
  extractDreamweavingPersistenceData,
  restoreDreamweavingPersistenceData
} from './store/slice';

// Commands (includes link file commands)
export { registerDreamweavingCommands, registerLinkFileCommands, enhanceFileSuggestions, EnhancedFileSuggest } from './commands';

// Types
export * from './types/dreamsong';
export * from './types/relationship';

// Services
export { DreamSongRelationshipService } from './services/dreamsong-relationship-service';
export { DreamSongParserService } from './services/dreamsong-parser-service';
export { CanvasParserService } from './services/canvas-parser-service';
export { CanvasLayoutService } from './services/canvas-layout-service';
export { SubmoduleManagerService } from './services/submodule-manager-service';
export { CanvasObserverService } from './services/canvas-observer-service';
export { AudioStreamingServiceImpl, initializeAudioStreamingService, getAudioStreamingService } from './services/audio-streaming-service';

// Components
export { DreamSong } from './components/DreamSong';
export { DreamSongWithExtensions } from './components/DreamSongWithExtensions';
export { ReadmeSection } from './components/ReadmeSection';

// Views
export { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from './components/DreamSongFullScreenView';
export { LinkFileView, LINK_FILE_VIEW_TYPE } from './components/LinkFileView';

// Hooks
export { useDreamSongData, useDreamSongExists } from './hooks/useDreamSongData';

// Dreamsong pure functions (parser, hasher, media-resolver)
// Note: Types ProcessedCanvasEdge, MediaTextPair, TopologicalSortResult are already exported from types/dreamsong
export {
  parseCanvasToBlocks,
  processCanvasEdges,
  findMediaTextPairs,
  topologicalSort,
  createContentBlocks,
  createMediaInfoFromNode,
  extractSourceDreamNodeId,
  createAltText,
  processTextContent,
  generateStructureHash,
  generateCanvasStructureHash,
  getEmptyContentHash,
  hashesEqual,
  isValidHash,
  resolveMediaPaths,
  resolveMediaInfo,
  getMimeType,
  isMediaFile,
  getMediaTypeFromFilename,
  parseAndResolveCanvas,
  parseCanvasForHash
} from './dreamsong/index';

// Note: AudioClipPlayer, ConversationsSection, and PerspectivesSection
// have been moved to features/songline/ as part of the Songline feature extraction
