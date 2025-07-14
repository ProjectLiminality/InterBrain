/**
 * DreamNode Types - Core data structures for InterBrain spatial visualization
 * 
 * Based on Git-native architecture where each DreamNode is a Git repository
 * with explicit file path arrays stored in UDD (Universal Dream Description) files.
 */

/**
 * Universal Dream Description (UDD) file structure
 * Stored as .udd file in each DreamNode Git repository
 */
export interface UDDFile {
  /** Unique identifier for this DreamNode */
  id: string;
  
  /** Type of DreamNode - determines color coding and relationships */
  type: 'dream' | 'dreamer';
  
  /** Array of file paths (relative to repo root) for DreamTalk symbols */
  dreamTalk: string[];
  
  /** Array of file paths for DreamSong content (Obsidian canvas files) */
  dreamSong: string[];
  
  /** IDs of related DreamNodes in the liminal web */
  liminalWeb: string[];
  
  /** Optional: Last known position in 3D space */
  position?: [number, number, number];
  
  /** Optional: Display name (defaults to repo name) */
  name?: string;
  
  /** Optional: Description or notes */
  description?: string;
  
  /** Metadata about the repo itself */
  repo: {
    /** Path to the Git repository */
    path: string;
    /** Last commit hash for change detection */
    lastCommit?: string;
    /** Repository URL if remote */
    remoteUrl?: string;
  };
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