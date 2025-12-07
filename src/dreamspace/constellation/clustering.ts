/**
 * Clustering Utility for Constellation Visualization
 *
 * Implements connected components detection to automatically group DreamNodes
 * based on their DreamSong relationship connections. This creates visual
 * clusters with consistent colors for related nodes.
 */

import { Vector3 } from 'three';
import { DreamSongRelationshipGraph, DreamSongNode } from '../../core/types/constellation';

/**
 * Represents a cluster of connected DreamNodes
 */
export interface Cluster {
  /** Unique cluster ID */
  id: number;

  /** Array of DreamNode IDs in this cluster */
  nodeIds: string[];

  /** Number of nodes in cluster */
  size: number;

  /** Visual color for this cluster */
  color: string;

  /** Geometric center of cluster on sphere */
  center: Vector3;

  /** Angular radius of cluster (for spherical caps) */
  radius: number;
}

/**
 * Result of clustering analysis
 */
export interface ClusteringResult {
  /** Array of detected clusters */
  clusters: Cluster[];

  /** Map from node ID to cluster ID */
  nodeToCluster: Map<string, number>;

  /** Statistics */
  stats: {
    totalClusters: number;
    largestClusterSize: number;
    singletonClusters: number;
  };
}

/**
 * Predefined color palette for clusters
 * Based on the HTML implementation with good visual separation
 */
const CLUSTER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffa726',
  '#ab47bc', '#ef5350', '#26c6da', '#66bb6a', '#ffee58',
  '#8d6e63', '#bdbdbd', '#ff8a65', '#81c784', '#64b5f6'
];

/**
 * Detect connected components in the relationship graph
 *
 * Uses depth-first search to find all connected components,
 * treating the relationship graph as undirected.
 */
export function detectConnectedComponents(graph: DreamSongRelationshipGraph): ClusteringResult {
  const visited = new Set<string>();
  const clusters: Cluster[] = [];
  const nodeToCluster = new Map<string, number>();

  // Build adjacency list for efficient traversal
  const adjacency = new Map<string, string[]>();

  // Initialize adjacency list with all nodes
  for (const [nodeId] of graph.nodes) {
    adjacency.set(nodeId, []);
  }

  // Add edges to adjacency list (treating as undirected)
  for (const edge of graph.edges) {
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
      adjacency.get(edge.target)!.push(edge.source);
    }
  }

  let clusterId = 0;

  // Depth-first search to find connected components
  function dfs(nodeId: string, component: string[]): void {
    visited.add(nodeId);
    component.push(nodeId);

    const neighbors = adjacency.get(nodeId) || [];
    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        dfs(neighborId, component);
      }
    }
  }

  // Find all connected components
  for (const [nodeId] of graph.nodes) {
    if (!visited.has(nodeId)) {
      const component: string[] = [];
      dfs(nodeId, component);

      if (component.length > 0) {
        // Calculate cluster center and radius
        const center = calculateClusterCenter(component, graph.nodes);
        const radius = calculateClusterRadius(component, graph.nodes, center);

        const cluster: Cluster = {
          id: clusterId,
          nodeIds: component,
          size: component.length,
          color: CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length],
          center,
          radius
        };

        clusters.push(cluster);

        // Map all nodes in this component to the cluster
        for (const componentNodeId of component) {
          nodeToCluster.set(componentNodeId, clusterId);
        }

        clusterId++;
      }
    }
  }

  // Calculate statistics
  const stats = {
    totalClusters: clusters.length,
    largestClusterSize: Math.max(...clusters.map(c => c.size), 0),
    singletonClusters: clusters.filter(c => c.size === 1).length
  };

  return {
    clusters,
    nodeToCluster,
    stats
  };
}

/**
 * Calculate the geometric center of a cluster on the sphere
 */
function calculateClusterCenter(nodeIds: string[], nodes: Map<string, DreamSongNode>): Vector3 {
  if (nodeIds.length === 0) return new Vector3(0, 0, -1);

  // For nodes on a sphere, we need to average their positions properly
  // Simple arithmetic mean can pull the center inside the sphere
  const sum = new Vector3(0, 0, 0);
  let validNodeCount = 0;

  for (const nodeId of nodeIds) {
    const node = nodes.get(nodeId);
    if (node) {
      // Assume nodes have their sphere positions stored (will be added by visualization layer)
      // For now, use a reasonable default position
      const nodePosition = new Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      ).normalize().multiplyScalar(-5000); // Place on sphere surface

      sum.add(nodePosition);
      validNodeCount++;
    }
  }

  if (validNodeCount === 0) return new Vector3(0, 0, -5000);

  // Average and project back to sphere surface
  return sum.divideScalar(validNodeCount).normalize().multiplyScalar(-5000);
}

/**
 * Calculate the angular radius of a cluster
 */
function calculateClusterRadius(nodeIds: string[], nodes: Map<string, DreamSongNode>, _center: Vector3): number {
  if (nodeIds.length <= 1) return 0.1; // Small radius for singleton clusters

  let maxDistance = 0;

  for (const nodeId of nodeIds) {
    const node = nodes.get(nodeId);
    if (node) {
      // Calculate angular distance on sphere
      // For now, use a simple heuristic based on cluster size
      const distance = Math.sqrt(nodeIds.length) * 0.2;
      maxDistance = Math.max(maxDistance, distance);
    }
  }

  return Math.min(maxDistance, Math.PI / 2); // Cap at 90 degrees
}

/**
 * Get cluster color by node ID
 */
export function getClusterColor(nodeId: string, clusteringResult: ClusteringResult): string {
  const clusterId = clusteringResult.nodeToCluster.get(nodeId);
  if (clusterId !== undefined) {
    const cluster = clusteringResult.clusters.find(c => c.id === clusterId);
    if (cluster) {
      return cluster.color;
    }
  }

  // Default color for unclustered nodes
  return '#888888';
}

/**
 * Check if two nodes are in the same cluster
 */
export function areNodesInSameCluster(nodeId1: string, nodeId2: string, clusteringResult: ClusteringResult): boolean {
  const cluster1 = clusteringResult.nodeToCluster.get(nodeId1);
  const cluster2 = clusteringResult.nodeToCluster.get(nodeId2);

  return cluster1 !== undefined && cluster2 !== undefined && cluster1 === cluster2;
}