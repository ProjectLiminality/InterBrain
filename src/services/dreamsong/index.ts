/**
 * DreamSong Services - Clean API Exports
 *
 * Layer 1 of the three-layer DreamSong architecture.
 * Exports pure functions for parsing, hashing, and media resolution.
 */

// Parser exports
export {
  parseCanvasToBlocks,
  processCanvasEdges,
  findMediaTextPairs,
  topologicalSort,
  createContentBlocks,
  createMediaInfoFromNode,
  extractSourceDreamNodeId,
  createAltText,
  processTextContent
} from './parser';

export type {
  ProcessedCanvasEdge,
  MediaTextPair,
  TopologicalSortResult
} from './parser';

// Hasher exports
export {
  generateStructureHash,
  generateCanvasStructureHash,
  getEmptyContentHash,
  hashesEqual,
  isValidHash
} from './hasher';

// Media resolver exports
export {
  resolveMediaPaths,
  resolveMediaInfo,
  getMimeType,
  isMediaFile,
  getMediaTypeFromFilename
} from './media-resolver';

// Import the functions for the convenience functions
import { parseCanvasToBlocks } from './parser';
import { generateStructureHash } from './hasher';
import { resolveMediaPaths } from './media-resolver';

/**
 * Main convenience function that combines all three layers
 * This is the primary API for converting canvas data to resolved DreamSong blocks
 */
export async function parseAndResolveCanvas(
  canvasData: any,
  dreamNodePath: string,
  vaultService: any
) {
  // Layer 1: Parse canvas to blocks
  const blocks = parseCanvasToBlocks(canvasData);

  // Layer 2: Generate hash for change detection
  const hash = generateStructureHash(blocks);

  // Layer 3: Resolve media paths
  const resolvedBlocks = await resolveMediaPaths(blocks, dreamNodePath, vaultService);

  return {
    blocks: resolvedBlocks,
    hash,
    hasContent: resolvedBlocks.length > 0
  };
}

/**
 * Quick parsing without media resolution (for hash-only operations)
 */
export function parseCanvasForHash(canvasData: any) {
  const blocks = parseCanvasToBlocks(canvasData);
  const hash = generateStructureHash(blocks);

  return {
    blocks,
    hash,
    hasContent: blocks.length > 0
  };
}