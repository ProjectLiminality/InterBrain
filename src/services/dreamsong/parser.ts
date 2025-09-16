/**
 * DreamSong Parser - Pure Parsing Functions
 *
 * Layer 1 of the three-layer DreamSong architecture.
 * Contains only pure functions that transform canvas data into ordered blocks.
 * No side effects, no caching, no external dependencies.
 */

import { CanvasData, CanvasNode, CanvasEdge } from '../canvas-parser-service';
import { DreamSongBlock, MediaInfo } from '../../types/dreamsong';

// Processed edge for topological sorting
export interface ProcessedCanvasEdge {
  fromNodeId: string;
  toNodeId: string;
  isDirected: boolean;
  edgeId: string;
}

// Media-text pairing information
export interface MediaTextPair {
  mediaNodeId: string;
  textNodeId: string;
  edgeId: string;
}

// Topological sort result
export interface TopologicalSortResult {
  sortedNodeIds: string[];
  hasCycle: boolean;
  nodesInCycle?: string[];
}

/**
 * Main parser function - transforms canvas data into ordered DreamSong blocks
 * This is the entry point that orchestrates the entire parsing pipeline
 */
export function parseCanvasToBlocks(canvasData: CanvasData, sourceDreamNodeId?: string): DreamSongBlock[] {
  // Validate input
  if (!canvasData.nodes || canvasData.nodes.length === 0) {
    return [];
  }

  // Process edges into directed and undirected categories
  const processedEdges = processCanvasEdges(canvasData.edges);

  // Find media-text pairs from undirected edges
  const mediaTextPairs = findMediaTextPairs(canvasData.nodes, processedEdges.undirected);

  // Filter nodes for topological sort: exclude text nodes that are part of pairs
  const textNodesInPairs = new Set(mediaTextPairs.map(pair => pair.textNodeId));
  const nodesForTopologicalSort = canvasData.nodes.filter(node => !textNodesInPairs.has(node.id));


  // Perform topological sort on directed edges only, using filtered nodes
  const sortResult = topologicalSort(nodesForTopologicalSort, processedEdges.directed);

  if (sortResult.hasCycle) {
    throw new Error(`Canvas contains circular dependencies: ${sortResult.nodesInCycle?.join(', ')}`);
  }

  // Create content blocks from sorted nodes
  // Note: sortResult.sortedNodeIds only contains media nodes from pairs + standalone nodes
  // but createContentBlocks still has access to all original nodes via canvasData.nodes
  const blocks = createContentBlocks(
    canvasData.nodes,
    sortResult.sortedNodeIds,
    mediaTextPairs,
    sourceDreamNodeId
  );

  return blocks;
}

/**
 * Process canvas edges into directed and undirected categories
 */
export function processCanvasEdges(edges: CanvasEdge[]): { directed: ProcessedCanvasEdge[], undirected: ProcessedCanvasEdge[] } {
  const directed: ProcessedCanvasEdge[] = [];
  const undirected: ProcessedCanvasEdge[] = [];

  for (const edge of edges) {
    const processedEdge: ProcessedCanvasEdge = {
      fromNodeId: edge.fromNode,
      toNodeId: edge.toNode,
      isDirected: edge.toEnd !== 'none', // Undirected edges have toEnd: 'none'
      edgeId: edge.id
    };

    if (processedEdge.isDirected) {
      directed.push(processedEdge);
    } else {
      undirected.push(processedEdge);
    }
  }

  return { directed, undirected };
}

/**
 * Find media-text pairs connected by undirected edges
 */
export function findMediaTextPairs(nodes: CanvasNode[], undirectedEdges: ProcessedCanvasEdge[]): MediaTextPair[] {
  const pairs: MediaTextPair[] = [];
  const nodesMap = new Map(nodes.map(n => [n.id, n]));

  for (const edge of undirectedEdges) {
    const fromNode = nodesMap.get(edge.fromNodeId);
    const toNode = nodesMap.get(edge.toNodeId);

    if (!fromNode || !toNode) continue;

    // Check if one is file (media) and other is text
    let mediaNode: CanvasNode | null = null;
    let textNode: CanvasNode | null = null;

    if (fromNode.type === 'file' && toNode.type === 'text') {
      mediaNode = fromNode;
      textNode = toNode;
    } else if (fromNode.type === 'text' && toNode.type === 'file') {
      mediaNode = toNode;
      textNode = fromNode;
    }

    if (mediaNode && textNode) {
      pairs.push({
        mediaNodeId: mediaNode.id,
        textNodeId: textNode.id,
        edgeId: edge.edgeId
      });
    }
  }

  return pairs;
}

/**
 * Kahn's algorithm for topological sorting
 */
export function topologicalSort(nodes: CanvasNode[], directedEdges: ProcessedCanvasEdge[]): TopologicalSortResult {
  // Build adjacency list and in-degree map
  const adjList = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const nodeIds = new Set(nodes.map(n => n.id));

  // Initialize
  for (const nodeId of nodeIds) {
    adjList.set(nodeId, []);
    inDegree.set(nodeId, 0);
  }

  // Process directed edges
  for (const edge of directedEdges) {
    if (nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId)) {
      adjList.get(edge.fromNodeId)!.push(edge.toNodeId);
      inDegree.set(edge.toNodeId, inDegree.get(edge.toNodeId)! + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const sortedList: string[] = [];

  // Start with nodes that have no incoming edges, preserving original order
  for (const node of nodes) {
    if (nodeIds.has(node.id) && inDegree.get(node.id) === 0) {
      queue.push(node.id);
    }
  }

  while (queue.length > 0) {
    const currentNode = queue.shift()!;
    sortedList.push(currentNode);

    // Process neighbors
    const neighbors = adjList.get(currentNode) || [];
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycles
  const hasCycle = sortedList.length !== Array.from(nodeIds).length;
  const nodesInCycle = hasCycle ?
    Array.from(nodeIds).filter(id => !sortedList.includes(id)) :
    undefined;

  return {
    sortedNodeIds: sortedList,
    hasCycle,
    nodesInCycle
  };
}

/**
 * Create content blocks from sorted nodes and pairs
 * This handles the flip-flop logic by tracking media-text pairs
 */
export function createContentBlocks(
  nodes: CanvasNode[],
  sortedNodeIds: string[],
  mediaTextPairs: MediaTextPair[],
  sourceDreamNodeId?: string
): DreamSongBlock[] {
  const blocks: DreamSongBlock[] = [];
  const nodesMap = new Map(nodes.map(n => [n.id, n]));
  const processedNodes = new Set<string>();

  // Create pair lookup maps
  const pairsByMediaId = new Map<string, MediaTextPair>();
  const pairsByTextId = new Map<string, MediaTextPair>();

  for (const pair of mediaTextPairs) {
    pairsByMediaId.set(pair.mediaNodeId, pair);
    pairsByTextId.set(pair.textNodeId, pair);
  }

  let isLeftAligned = true; // Start with left alignment, then alternate

  for (const nodeId of sortedNodeIds) {
    if (processedNodes.has(nodeId)) continue;

    const node = nodesMap.get(nodeId);
    if (!node) continue;

    // Only process pairs when we hit the media node, not the text node
    // This ensures media-text blocks appear at the media node's position in topological order
    const mediaTextPair = node.type === 'file' ? pairsByMediaId.get(nodeId) : null;

    if (mediaTextPair && !processedNodes.has(mediaTextPair.mediaNodeId) && !processedNodes.has(mediaTextPair.textNodeId)) {
      // Create media-text block
      const mediaNode = nodesMap.get(mediaTextPair.mediaNodeId);
      const textNode = nodesMap.get(mediaTextPair.textNodeId);

      if (mediaNode && textNode) {
        const mediaInfo = createMediaInfoFromNode(mediaNode, sourceDreamNodeId);
        const textContent = processTextContent(textNode.text || '');

        if (mediaInfo) {
          blocks.push({
            id: `${mediaTextPair.mediaNodeId}-${mediaTextPair.textNodeId}`,
            type: 'media-text',
            media: mediaInfo,
            text: textContent,
            isLeftAligned: isLeftAligned
          });
        }

        processedNodes.add(mediaTextPair.mediaNodeId);
        processedNodes.add(mediaTextPair.textNodeId);
        isLeftAligned = !isLeftAligned; // Alternate for next media-text block
      }
    } else {
      // Create standalone block
      if (node.type === 'file') {
        const mediaInfo = createMediaInfoFromNode(node, sourceDreamNodeId);
        if (mediaInfo) {
          blocks.push({
            id: nodeId,
            type: 'media',
            media: mediaInfo
          });
        }
      } else if (node.type === 'text' && node.text) {
        const textContent = processTextContent(node.text);
        if (textContent.trim()) {
          blocks.push({
            id: nodeId,
            type: 'text',
            text: textContent
          });
        }
      }

      processedNodes.add(nodeId);
    }
  }

  return blocks;
}

/**
 * Create media info from file node (without path resolution)
 * Path resolution will be handled in a separate layer
 */
export function createMediaInfoFromNode(fileNode: CanvasNode, sourceDreamNodeId?: string): MediaInfo | null {
  if (!fileNode.file) return null;

  const filename = fileNode.file;
  const extension = filename.split('.').pop()?.toLowerCase() || '';

  let mediaType: 'video' | 'image' | 'audio' | 'pdf';
  if (['mp4', 'webm', 'ogg', 'mov'].includes(extension)) {
    mediaType = 'video';
  } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(extension)) {
    mediaType = 'image';
  } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(extension)) {
    mediaType = 'audio';
  } else if (extension === 'pdf') {
    mediaType = 'pdf';
  } else {
    return null; // Unsupported media type
  }

  // Extract source DreamNode ID from file path, with fallback to current DreamNode
  const extractedSourceId = extractSourceDreamNodeId(filename);
  const finalSourceDreamNodeId = extractedSourceId || sourceDreamNodeId; // Use current DreamNode for local files

  return {
    type: mediaType,
    src: filename, // Will be resolved later by media-resolver
    alt: createAltText(filename),
    sourceDreamNodeId: finalSourceDreamNodeId
  };
}

/**
 * Extract source DreamNode ID from media file path
 * Handles paths like "PlayPad/OtherDreamNode/media/file.mp4" for submodule references
 */
export function extractSourceDreamNodeId(filename: string): string | undefined {
  // If path contains submodule reference (e.g., "PlayPad/OtherDreamNode/...")
  const submoduleMatch = filename.match(/^([^/]+)\/([^/]+)\//);
  if (submoduleMatch) {
    const submoduleName = submoduleMatch[2]; // "OtherDreamNode"
    return submoduleName; // Use submodule name as DreamNode ID
  }

  // If it's a local file (no submodule path), return undefined (not clickable)
  return undefined;
}

/**
 * Create alt text from filename
 */
export function createAltText(filename: string): string {
  const nameWithoutPath = filename.split('/').pop() || filename;
  const nameWithoutExtension = nameWithoutPath.split('.').slice(0, -1).join('.');

  return nameWithoutExtension
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Process text content (apply markdown parsing if needed)
 * For now, return as-is. Future: integrate markdown parser
 */
export function processTextContent(text: string): string {
  return text;
}