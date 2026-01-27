/**
 * Constellation Filter Service
 *
 * Computes which DreamNodes should be mounted in the constellation view at startup.
 * This enables InterBrain to scale to thousands of nodes by limiting what renders
 * in the "night sky" while allowing ephemeral nodes to spawn on-demand.
 *
 * Node Categories:
 * - VIP Seats: Nodes connected by edges (constellation members) - always mounted
 * - Standing Room: DreamSong owners (parents of edges) - always mounted
 * - General Admission: Random sample to fill remaining slots
 * - Ephemeral: Everything else - spawned on-demand, not mounted at startup
 */

import type { DreamSongRelationshipGraph, DreamSongEdge } from '../../dreamweaving/types/relationship';
import type { ConstellationFilterResult } from '../../../core/store/interbrain-store';

/**
 * Computes which nodes should be mounted in the constellation view
 *
 * @param relationshipGraph - The complete relationship graph from DreamSong scanning
 * @param allNodeIds - All node UUIDs in the vault
 * @param maxNodes - Maximum number of nodes to mount
 * @param prioritizeClusters - If true, prioritize nodes in larger clusters
 * @returns Categorized node sets for mounting decisions
 */
export function computeConstellationFilter(
  relationshipGraph: DreamSongRelationshipGraph | null,
  allNodeIds: string[],
  maxNodes: number,
  prioritizeClusters: boolean = true
): ConstellationFilterResult {
  const vipNodes = new Set<string>();
  const parentNodes = new Set<string>();
  const sampledNodes = new Set<string>();
  const mountedNodes = new Set<string>();
  const ephemeralNodes = new Set<string>();

  // If no relationship graph, sample from all nodes
  if (!relationshipGraph || relationshipGraph.edges.length === 0) {
    const shuffled = shuffleArray([...allNodeIds]);
    const toMount = shuffled.slice(0, maxNodes);
    const remaining = shuffled.slice(maxNodes);

    toMount.forEach(id => {
      sampledNodes.add(id);
      mountedNodes.add(id);
    });
    remaining.forEach(id => ephemeralNodes.add(id));

    return { vipNodes, parentNodes, sampledNodes, ephemeralNodes, mountedNodes };
  }

  // Step 1: Extract VIP nodes from edges (source + target of all edges)
  for (const edge of relationshipGraph.edges) {
    vipNodes.add(edge.source);
    vipNodes.add(edge.target);
  }

  // Step 2: Extract parent nodes from edge dreamSongPath
  // The parent is the DreamNode whose DreamSong.canvas defines the edge
  const parentNodeIds = extractParentNodesFromEdges(relationshipGraph.edges, relationshipGraph);
  parentNodeIds.forEach(id => parentNodes.add(id));

  // Step 3: Calculate guaranteed slots (VIP + parents that aren't already VIP)
  const guaranteedNodes = new Set<string>([...vipNodes, ...parentNodes]);
  guaranteedNodes.forEach(id => mountedNodes.add(id));

  // Step 4: If we have room, randomly sample remaining nodes
  const remainingSlots = maxNodes - mountedNodes.size;
  if (remainingSlots > 0) {
    // Get all nodes not already mounted
    const unmountedNodeIds = allNodeIds.filter(id => !mountedNodes.has(id));

    if (prioritizeClusters) {
      // Prioritize nodes that have some connection but aren't VIP
      // (e.g., referenced in text but not in media sequences)
      const connected = unmountedNodeIds.filter(id => {
        const node = relationshipGraph.nodes.get(id);
        return node && (node.incomingReferences > 0 || node.outgoingDreamSongs > 0);
      });
      const unconnected = unmountedNodeIds.filter(id => {
        const node = relationshipGraph.nodes.get(id);
        return !node || (node.incomingReferences === 0 && node.outgoingDreamSongs === 0);
      });

      // First add connected nodes, then fill with unconnected
      const shuffledConnected = shuffleArray(connected);
      const shuffledUnconnected = shuffleArray(unconnected);

      let filled = 0;
      for (const id of [...shuffledConnected, ...shuffledUnconnected]) {
        if (filled >= remainingSlots) break;
        sampledNodes.add(id);
        mountedNodes.add(id);
        filled++;
      }
    } else {
      // Pure random sampling
      const shuffled = shuffleArray(unmountedNodeIds);
      for (let i = 0; i < Math.min(remainingSlots, shuffled.length); i++) {
        sampledNodes.add(shuffled[i]);
        mountedNodes.add(shuffled[i]);
      }
    }
  }

  // Step 5: Mark all remaining nodes as ephemeral
  for (const id of allNodeIds) {
    if (!mountedNodes.has(id)) {
      ephemeralNodes.add(id);
    }
  }

  return { vipNodes, parentNodes, sampledNodes, ephemeralNodes, mountedNodes };
}

/**
 * Extracts parent DreamNode UUIDs from edge dreamSongPath
 *
 * The dreamSongPath is like "vault/SomeDreamNode/DreamSong.canvas"
 * We need to find the UUID of the DreamNode folder containing it.
 */
function extractParentNodesFromEdges(
  edges: DreamSongEdge[],
  graph: DreamSongRelationshipGraph
): Set<string> {
  const parentIds = new Set<string>();

  // Build a map from folder path to UUID for reverse lookup
  const pathToUuid = new Map<string, string>();
  for (const [uuid, node] of graph.nodes) {
    // dreamNodePath is like "SomeDreamNode" (folder name)
    pathToUuid.set(node.dreamNodePath, uuid);
  }

  // Extract parent folder from each edge's dreamSongPath
  for (const edge of edges) {
    // dreamSongPath is like "SomeDreamNode/DreamSong.canvas"
    // Extract the parent folder (everything before the last /)
    const parts = edge.dreamSongPath.split('/');
    if (parts.length >= 2) {
      // Remove the filename to get the folder path
      parts.pop(); // Remove "DreamSong.canvas"
      const parentPath = parts.join('/');

      // Look up the UUID for this path
      const uuid = pathToUuid.get(parentPath);
      if (uuid) {
        parentIds.add(uuid);
      }
    }
  }

  return parentIds;
}

/**
 * Fisher-Yates shuffle for random sampling
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Checks if a node ID is mounted (either in constellation or ephemeral)
 */
export function isNodeMounted(
  nodeId: string,
  constellationFilter: ConstellationFilterResult,
  ephemeralNodes: Map<string, unknown>
): boolean {
  return constellationFilter.mountedNodes.has(nodeId) || ephemeralNodes.has(nodeId);
}

/**
 * Gets the category of a node for debugging/display
 */
export function getNodeCategory(
  nodeId: string,
  filter: ConstellationFilterResult
): 'vip' | 'parent' | 'sampled' | 'ephemeral' {
  if (filter.vipNodes.has(nodeId)) return 'vip';
  if (filter.parentNodes.has(nodeId)) return 'parent';
  if (filter.sampledNodes.has(nodeId)) return 'sampled';
  return 'ephemeral';
}
