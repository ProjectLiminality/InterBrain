/**
 * DreamSong Types and Interfaces
 * 
 * Type definitions for DreamSong content blocks, media handling, and canvas parsing.
 * Used for the flip-side interface of DreamNodes that displays linear story flows
 * generated from canvas dependency graphs using topological sorting.
 */

// Media information for DreamSong blocks
export interface MediaInfo {
  type: 'video' | 'image' | 'audio' | 'pdf';
  src: string;
  alt: string;
  sourceDreamNodeId?: string; // ID of the DreamNode this media originates from (for clickable navigation)
  isLinkFile?: boolean; // Flag to indicate this is a .link file that needs special resolution
  linkMetadata?: import('../../features/drag-and-drop').LinkFileMetadata; // Full link metadata for .link files
}

// Content block types for DreamSong layout
export type DreamSongBlockType = 'text' | 'media' | 'media-text';

// Individual content block in a DreamSong
export interface DreamSongBlock {
  id: string; // Canvas node ID for tracking
  type: DreamSongBlockType;
  media?: MediaInfo;
  text?: string; // Markdown-parsed HTML
  // For media-text blocks, determines positioning in flip-flop layout
  isLeftAligned?: boolean;
}

// Complete DreamSong data structure
export interface DreamSongData {
  canvasPath: string;
  dreamNodePath: string; // Path to containing DreamNode
  blocks: DreamSongBlock[];
  totalBlocks: number;
  hasContent: boolean; // Quickly check if DreamSong has any displayable content
  lastParsed: number; // Timestamp for cache invalidation
}

// Canvas parsing configuration
export interface DreamSongParserConfig {
  enableMarkdownParsing: boolean;
  mediaPathPrefix: string; // Default: 'media/'
  alternateMediaTextLayout: boolean; // Enable flip-flop positioning
  maxBlocksToRender: number; // Performance limit
}

// Default parser configuration
export const DEFAULT_DREAMSONG_PARSER_CONFIG: DreamSongParserConfig = {
  enableMarkdownParsing: true,
  mediaPathPrefix: 'media/',
  alternateMediaTextLayout: true,
  maxBlocksToRender: 100
};

// Error types for DreamSong parsing
export interface DreamSongParseError {
  type: 'missing_canvas' | 'invalid_json' | 'circular_dependency' | 'empty_content' | 'parsing_error';
  message: string;
  canvasPath: string;
  nodeId?: string;
}

// Result type for DreamSong parsing operations
export interface DreamSongParseResult {
  success: boolean;
  data?: DreamSongData;
  error?: DreamSongParseError;
}

// Canvas topological sort result
export interface TopologicalSortResult {
  sortedNodeIds: string[];
  hasCycle: boolean;
  nodesInCycle?: string[];
}

// Canvas edge processing for topological sort
export interface ProcessedCanvasEdge {
  fromNodeId: string;
  toNodeId: string;
  isDirected: boolean; // false for undirected edges (toEnd: 'none')
  edgeId: string;
}

// Media-text pairing information
export interface MediaTextPair {
  mediaNodeId: string;
  textNodeId: string;
  edgeId: string;
}

// Flip animation state for DreamNode
export interface FlipState {
  isFlipped: boolean;
  isFlipping: boolean; // Animation in progress
  flipDirection: 'front-to-back' | 'back-to-front';
  animationStartTime: number;
}