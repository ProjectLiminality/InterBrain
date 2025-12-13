/**
 * DreamSong Hasher - Pure Hashing Functions
 *
 * Layer 1 of the three-layer DreamSong architecture.
 * Contains only pure functions that create structure hashes from DreamSong blocks.
 * Uses Node.js crypto module for proper hashing.
 */

import { DreamSongBlock } from '../types/dreamsong';
import { CanvasData, CanvasNode, CanvasEdge } from '../services/canvas-parser-service';

// Access Node.js crypto module directly in Electron context
 
const crypto = require('crypto');
 

/**
 * Generate a unique hash from DreamSong blocks structure
 * This hash changes only when the meaningful content changes, ignoring:
 * - Canvas coordinates
 * - Colors
 * - Other cosmetic properties
 */
export function generateStructureHash(blocks: DreamSongBlock[]): string {
  // Create structure fingerprint - only the parts that affect DreamSong output
  const structureData = {
    blocks: blocks.map((block, index) => ({
      // Essential structural data
      index, // Order matters in the story flow
      type: block.type,

      // Text content (if present)
      text: block.text || null,

      // Media information (if present)
      media: block.media ? {
        type: block.media.type,
        src: block.media.src, // File path/reference
        alt: block.media.alt,
        sourceDreamNodeId: block.media.sourceDreamNodeId || null
      } : null,

      // Layout information (for media-text blocks)
      isLeftAligned: block.isLeftAligned || null
    }))
  };

  // Convert to consistent string representation
  const structureString = JSON.stringify(structureData, null, 0); // No pretty-printing for consistency

  // Generate SHA-256 hash using Node.js crypto
  const hash = crypto.createHash('sha256');
  hash.update(structureString, 'utf8');

  // Return as base64 string (shorter than hex)
  return hash.digest('base64');
}

/**
 * Generate a hash from raw canvas data (before parsing)
 * Useful for detecting changes at the canvas level
 */
export function generateCanvasStructureHash(canvasData: CanvasData): string {
  // Extract only structural elements from canvas
  const structureData = {
    // Node content (excluding position)
    nodes: (canvasData.nodes || []).map((node: CanvasNode) => ({
      id: node.id,
      text: node.text || '',
      file: node.file || '',
      type: node.type,
      width: node.width,
      height: node.height
      // Deliberately exclude x, y coordinates and color
    })).sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)), // Sort for consistency

    // Edge relationships (structure)
    edges: (canvasData.edges || []).map((edge: CanvasEdge) => ({
      id: edge.id,
      fromNode: edge.fromNode,
      toNode: edge.toNode,
      toEnd: edge.toEnd || '' // Handle optional toEnd property
      // Exclude visual properties like color
    })).sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)) // Sort for consistency
  };

  // Convert to consistent string representation
  const structureString = JSON.stringify(structureData, null, 0);

  // Generate SHA-256 hash
  const hash = crypto.createHash('sha256');
  hash.update(structureString, 'utf8');

  return hash.digest('base64');
}

/**
 * Quick hash for empty content (special case)
 */
export function getEmptyContentHash(): string {
  return generateStructureHash([]);
}

/**
 * Compare two hashes for equality
 * Simple utility function for cleaner code
 */
export function hashesEqual(hash1: string | null, hash2: string | null): boolean {
  return hash1 === hash2;
}

/**
 * Validate that a hash looks correct (basic sanity check)
 */
export function isValidHash(hash: string): boolean {
  // SHA-256 base64 should be 44 characters (including padding)
  // Basic validation - proper base64 pattern
  const base64Pattern = /^[A-Za-z0-9+/]{42}[A-Za-z0-9+/=]{2}$/;
  return base64Pattern.test(hash);
}