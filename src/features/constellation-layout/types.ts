/**
 * Constellation Types
 *
 * Re-exports DreamSong relationship types from dreamweaving (the source of truth).
 * This file provides backward compatibility for constellation-layout imports.
 */

// Re-export all relationship types from dreamweaving
export type {
  DreamSongRelationshipGraph,
  DreamSongNode,
  DreamSongEdge,
  DreamSongScanResult,
  DreamSongRelationshipConfig,
  SerializableDreamSongGraph,
} from '../dreamweaving/types/relationship';

export {
  DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG,
  serializeRelationshipGraph,
  deserializeRelationshipGraph,
} from '../dreamweaving/types/relationship';
