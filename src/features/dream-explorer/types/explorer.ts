/**
 * Dream Explorer Types
 *
 * Data types for the full-screen holarchy file navigator.
 */

/** Visual classification of items in the explorer */
export type ExplorerItemType =
  | 'dream-submodule'
  | 'dreamer-submodule'
  | 'folder'
  | 'file'
  | 'image'
  | 'readme';

/** A single item displayed as a circle in the explorer */
export interface ExplorerItem {
  /** Display name (file/folder name without path) */
  name: string;
  /** Full vault-relative path */
  path: string;
  /** Visual classification */
  type: ExplorerItemType;
  /** File size in bytes (0 for directories) */
  size: number;
  /** Whether this item is a directory */
  isDirectory: boolean;
  /** If this is a submodule, the DreamNode UUID */
  dreamNodeId?: string;
  /** Absolute path to media file for image preview */
  mediaAbsolutePath?: string;
  /** Absolute path to this item on disk */
  absolutePath?: string;
}

/** Positioned item after circle packing layout */
export interface PositionedItem {
  item: ExplorerItem;
  x: number;
  y: number;
  r: number;
}

/** Layout mode for circle sizing and filtering */
export type ExplorerLayoutMode = 'equal' | 'weighted' | 'reduced';
