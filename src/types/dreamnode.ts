/**
 * DreamNode Types - Core data structures for InterBrain spatial visualization
 * 
 * Based on Git-native architecture where each DreamNode is a Git repository
 * with explicit file path arrays stored in UDD (Universal Dream Description) files.
 */

/**
 * Universal Dream Description (UDD) file structure
 * Stored as single .udd file in each DreamNode Git repository
 * Simplified schema optimized for performance and graph traversal
 */
export interface UDDFile {
  /** Unique identifier - constant, never changes after creation */
  uuid: string;

  /** Display name/title of the DreamNode */
  title: string;

  /** Type of DreamNode - determines color coding and relationships */
  type: 'dream' | 'dreamer';

  /** Single file reference path for DreamTalk symbol (relative to repo root) */
  dreamTalk: string;

  /** Array of UUIDs for horizontal liminal web relationships */
  liminalWebRelationships: string[];

  /** Array of UUIDs for vertical holonic relationships - children */
  submodules: string[];

  /** Array of UUIDs for vertical holonic relationships - parents */
  supermodules: string[];

  /** Optional contact email (for dreamer-type nodes) */
  email?: string;

  /** Optional contact phone number (for dreamer-type nodes) */
  phone?: string;

  /** Optional Radicle DID for peer-to-peer networking (for dreamer-type nodes) */
  radicleId?: string;

  /** Optional GitHub repository URL for fallback sharing */
  githubRepoUrl?: string;

  /** Optional GitHub Pages URL for public DreamSong broadcast */
  githubPagesUrl?: string;
}

/**
 * Runtime DreamNode data structure for React components
 * Derived from UDD file + resolved file paths
 */
export interface DreamNode {
  /** Unique identifier */
  id: string;
  
  /** Type determines visual styling */
  type: 'dream' | 'dreamer';
  
  /** Display name */
  name: string;
  
  /** Current position in 3D space */
  position: [number, number, number];
  
  /** Resolved media files for DreamTalk display */
  dreamTalkMedia: MediaFile[];
  
  /** Resolved canvas content for DreamSong display */
  dreamSongContent: CanvasFile[];
  
  /** Connected DreamNode IDs */
  liminalWebConnections: string[];
  
  /** Repository information */
  repoPath: string;
  
  /** Whether this node has unsaved changes */
  hasUnsavedChanges: boolean;
  
  /** Git status information for visual indicators */
  gitStatus?: GitStatus;

  /** Optional contact email (for dreamer-type nodes) */
  email?: string;

  /** Optional contact phone number (for dreamer-type nodes) */
  phone?: string;

  /** Optional Radicle DID for peer-to-peer networking (for dreamer-type nodes) */
  radicleId?: string;

  /** Optional GitHub repository URL for fallback sharing */
  githubRepoUrl?: string;

  /** Optional GitHub Pages URL for public DreamSong broadcast */
  githubPagesUrl?: string;
}

/**
 * Media file with resolved content for DreamTalk symbols
 */
export interface MediaFile {
  /** File path relative to repo root */
  path: string;
  
  /** Absolute file system path */
  absolutePath: string;
  
  /** MIME type */
  type: string;
  
  /** File contents as data URL or file path */
  data: string;
  
  /** File size in bytes */
  size: number;
}

/**
 * Obsidian canvas file for DreamSong content
 */
export interface CanvasFile {
  /** File path relative to repo root */
  path: string;
  
  /** Absolute file system path */
  absolutePath: string;
  
  /** Parsed canvas JSON content */
  content: ObsidianCanvasData;
}

/**
 * Obsidian canvas file structure
 * Based on Obsidian's native .canvas format
 */
export interface ObsidianCanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasNode {
  id: string;
  type: 'text' | 'file' | 'link' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  color?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: 'top' | 'right' | 'bottom' | 'left';
  toNode: string;
  toSide: 'top' | 'right' | 'bottom' | 'left';
  color?: string;
  label?: string;
}

/**
 * Layout information for spatial positioning
 */
export interface SpatialLayout {
  /** Layout algorithm being used */
  type: 'fibonacci-sphere' | 'honeycomb' | 'constellation' | 'focused';
  
  /** Center point of the layout */
  center: [number, number, number];
  
  /** Scale factor for the layout */
  scale: number;
  
  /** Additional layout-specific parameters */
  params?: Record<string, unknown>;
}

/**
 * Git status information for visual indicators
 */
export interface GitStatus {
  /** Whether there are uncommitted changes (staged or unstaged) */
  hasUncommittedChanges: boolean;
  
  /** Whether there are stashed changes */
  hasStashedChanges: boolean;
  
  /** Whether there are unpushed commits (ahead of remote) */
  hasUnpushedChanges: boolean;
  
  /** Last time git status was checked */
  lastChecked: number;
  
  /** Optional detailed status information */
  details?: {
    staged?: number;
    unstaged?: number;
    untracked?: number;
    stashCount?: number;
    aheadCount?: number;
    commitHash?: string;
  };
}

/**
 * Visual state for LOD (Level of Detail) system
 */
export interface VisualState {
  /** Current level of detail */
  lod: 'star' | 'node' | 'detailed';
  
  /** Scale factor based on distance from camera */
  scale: number;
  
  /** Whether this node should billboard (always face camera) */
  billboard: boolean;
  
  /** Distance from camera */
  distanceFromCamera: number;
  
  /** Whether mouse is hovering over this node */
  isHovered: boolean;
  
  /** Whether this node is currently selected */
  isSelected: boolean;
}