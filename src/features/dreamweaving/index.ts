// Dreamweaving feature exports
export { registerDreamweavingCommands } from './commands';
export { registerLinkFileCommands, enhanceFileSuggestions } from './link-file-commands';

// Types
export * from './types/dreamsong';

// Components
export { DreamSong } from './DreamSong';
export { DreamSongWithExtensions } from './DreamSongWithExtensions';
export { ReadmeSection } from './ReadmeSection';

// Views
export { DreamSongFullScreenView, DREAMSONG_FULLSCREEN_VIEW_TYPE } from './DreamSongFullScreenView';
export { LinkFileView, LINK_FILE_VIEW_TYPE } from './LinkFileView';

// Hooks
export { useDreamSongData } from './useDreamSongData';

// Note: AudioClipPlayer, ConversationsSection, and PerspectivesSection
// have been moved to features/songline/ as part of the Songline feature extraction
