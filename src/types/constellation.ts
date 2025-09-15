/**
 * Constellation Types - Data structures for DreamSong relationship graph visualization
 *
 * Defines the relationship graph extracted from DreamSong canvas sequences
 * for use in the constellation layout algorithm on the sphere.
 */

/**
 * Complete relationship graph extracted from vault DreamSongs
 */
export interface DreamSongRelationshipGraph {
  /** All DreamNodes indexed by UUID */
  nodes: Map<string, DreamSongNode>;

  /** All relationships derived from DreamSong sequences */
  edges: DreamSongEdge[];

  /** Statistics about the scan */
  metadata: {
    totalNodes: number;
    totalDreamSongs: number;
    totalEdges: number;
    standaloneNodes: number;
    lastScanned: number;
  };
}

/**
 * Node in the relationship graph (represents a DreamNode)
 */
export interface DreamSongNode {
  /** DreamNode UUID from .udd metadata */
  id: string;

  /** Path to DreamNode folder in vault */
  dreamNodePath: string;

  /** Display title from UDD metadata */
  title: string;

  /** DreamNode type from UDD */
  type: 'dream' | 'dreamer';

  /** True if this node has no DreamSong connections */
  isStandalone: boolean;

  /** Number of DreamSongs that reference this node */
  incomingReferences: number;

  /** Number of DreamSongs this node contains */
  outgoingDreamSongs: number;
}

/**
 * Edge representing a sequential relationship in a DreamSong
 */
export interface DreamSongEdge {
  /** Source DreamNode UUID */
  source: string;

  /** Target DreamNode UUID */
  target: string;

  /** Identifier for grouping edges from same DreamSong */
  dreamSongId: string;

  /** Path to the DreamSong.canvas file that created this edge */
  dreamSongPath: string;

  /** Position in the original sequence (0-based) */
  sequenceIndex: number;

  /** Weight for layout algorithm (could be based on frequency) */
  weight: number;
}

/**
 * Result of scanning vault for DreamSong relationships
 */
export interface DreamSongScanResult {
  /** True if scan completed successfully */
  success: boolean;

  /** The extracted relationship graph (if successful) */
  graph?: DreamSongRelationshipGraph;

  /** Error information (if failed) */
  error?: {
    message: string;
    type: 'vault_access' | 'parsing_error' | 'uuid_mapping';
    details?: string;
  };

  /** Performance and debug information */
  stats: {
    nodesScanned: number;
    dreamSongsFound: number;
    dreamSongsParsed: number;
    edgesCreated: number;
    scanTimeMs: number;
  };
}

/**
 * Configuration for DreamSong relationship extraction
 */
export interface DreamSongRelationshipConfig {
  /** Whether to include standalone nodes (no DreamSong connections) */
  includeStandaloneNodes: boolean;

  /** Minimum sequence length to create edges (default: 2) */
  minSequenceLength: number;

  /** Whether to create bidirectional edges from sequences */
  createBidirectionalEdges: boolean;

  /** Maximum edges to create per DreamSong (performance limit) */
  maxEdgesPerDreamSong: number;
}

/**
 * Default configuration for relationship extraction
 */
export const DEFAULT_DREAMSONG_RELATIONSHIP_CONFIG: DreamSongRelationshipConfig = {
  includeStandaloneNodes: true,
  minSequenceLength: 2,
  createBidirectionalEdges: true,
  maxEdgesPerDreamSong: 100
};

/**
 * Serializable version of relationship graph for JSON export
 */
export interface SerializableDreamSongGraph {
  /** Nodes as array for JSON serialization */
  nodes: DreamSongNode[];

  /** Edges array */
  edges: DreamSongEdge[];

  /** Metadata */
  metadata: DreamSongRelationshipGraph['metadata'];
}

/**
 * Convert Map-based graph to serializable format
 */
export function serializeRelationshipGraph(graph: DreamSongRelationshipGraph): SerializableDreamSongGraph {
  return {
    nodes: Array.from(graph.nodes.values()),
    edges: graph.edges,
    metadata: graph.metadata
  };
}

/**
 * Convert serializable format back to Map-based graph
 */
export function deserializeRelationshipGraph(serialized: SerializableDreamSongGraph): DreamSongRelationshipGraph {
  const nodes = new Map<string, DreamSongNode>();

  for (const node of serialized.nodes) {
    nodes.set(node.id, node);
  }

  return {
    nodes,
    edges: serialized.edges,
    metadata: serialized.metadata
  };
}