/**
 * Constellation Layout Algorithm
 *
 * Main orchestrator for the constellation layout system. Implements the complete
 * pipeline from the HTML prototype: clustering, global positioning, local layouts,
 * and sphere projection. Transforms relationship-aware positioning into 3D coordinates.
 */

import { Vector3 } from 'three';
import { DreamSongRelationshipGraph } from '../../types/constellation';
import { DreamNode } from '../../types/dreamnode';
import {
  ConstellationLayoutConfig,
  ConstellationLayoutResult,
  ConstellationCluster,
  LayoutStatistics,
  CLUSTER_COLORS,
  DEFAULT_CONSTELLATION_CONFIG
} from './LayoutConfig';
import { detectConnectedComponents } from './clustering';
import { computeClusterLayout } from './ForceDirected';
import { refineClusterPositions } from './ClusterRefinement';
import {
  fibonacciSphere,
  sphericalCapArea,
  areaToRadius,
  exponentialMap,
  getTangentBasis,
  scaleToSphere
} from './SphericalProjection';

/**
 * Compute complete constellation layout from relationship graph
 *
 * This is the main entry point that orchestrates the entire layout pipeline:
 * 1. Detect connected components (clusters)
 * 2. Compute global cluster positioning on sphere
 * 3. Compute local force-directed layouts within clusters
 * 4. Project planar layouts to sphere surface
 * 5. Refine positions to eliminate overlaps
 *
 * @param relationshipGraph Graph of DreamNode relationships
 * @param dreamNodes Array of all DreamNodes for validation
 * @param config Layout configuration parameters
 * @returns Complete layout result with final positions
 */
export function computeConstellationLayout(
  relationshipGraph: DreamSongRelationshipGraph,
  dreamNodes: DreamNode[],
  config: ConstellationLayoutConfig = DEFAULT_CONSTELLATION_CONFIG
): ConstellationLayoutResult {
  const startTime = performance.now();

  try {
    // Phase 1: Detect clusters using connected components
    const clusteringResult = detectConnectedComponents(relationshipGraph);

    if (clusteringResult.clusters.length === 0) {
      console.warn('⚠️ [ConstellationLayout] No clusters found, returning empty layout');
      return createEmptyLayout(startTime);
    }

    // Convert clustering result to constellation clusters
    const clusters: ConstellationCluster[] = clusteringResult.clusters.map(cluster => ({
      id: cluster.id,
      nodeIds: cluster.nodeIds,
      center: new Vector3(0, 0, -1), // Will be set in global positioning
      radius: 0, // Will be calculated in global positioning
      color: CLUSTER_COLORS[cluster.id % CLUSTER_COLORS.length],
      size: cluster.size
    }));

    // Phase 2: Global positioning - place clusters on sphere
    const clustersWithPositions = computeGlobalPositioning(clusters, config);

    // Phase 3: Local layouts - force-directed within each cluster
    const nodePositions = new Map<string, [number, number, number]>();

    for (const cluster of clustersWithPositions) {
      const clusterEdges = relationshipGraph.edges.filter(edge =>
        cluster.nodeIds.includes(edge.source) && cluster.nodeIds.includes(edge.target)
      );

      // Compute 2D force-directed layout for this cluster
      const layoutResult = computeClusterLayout(
        cluster,
        relationshipGraph.nodes,
        clusterEdges,
        config
      );

      // Project 2D positions to sphere surface
      if (layoutResult.positions.size > 0) {
        const tangentBasis = getTangentBasis(cluster.center);

        for (const [nodeId, planarPos] of layoutResult.positions) {
          const spherePos = exponentialMap(cluster.center, planarPos, tangentBasis);
          const scaledPos = scaleToSphere(spherePos, config.sphereRadius);
          nodePositions.set(nodeId, scaledPos);
        }
      }
    }

    // Phase 4: Handle standalone nodes (not in any cluster)
    const allNodeIds = new Set(Array.from(relationshipGraph.nodes.keys()));
    const clusteredNodeIds = new Set(clusters.flatMap(c => c.nodeIds));
    const standaloneNodeIds = Array.from(allNodeIds).filter(id => !clusteredNodeIds.has(id));

    if (standaloneNodeIds.length > 0) {

      // Use fibonacci distribution for standalone nodes
      const standalonePoints = fibonacciSphere(standaloneNodeIds.length);

      standaloneNodeIds.forEach((nodeId, index) => {
        const scaledPos = scaleToSphere(standalonePoints[index], config.sphereRadius);
        nodePositions.set(nodeId, scaledPos);
      });
    }

    // Phase 5: Cluster refinement to eliminate overlaps
    const refinementResult = refineClusterPositions(clustersWithPositions, config);

    if (!refinementResult.success && refinementResult.remainingOverlaps > 0) {
      console.warn(`⚠️ [ConstellationLayout] Refinement incomplete: ${refinementResult.remainingOverlaps} overlaps remain`);
    }

    // Update node positions after cluster refinement
    if (refinementResult.totalDisplacement > 0) {
      for (const cluster of refinementResult.clusters) {
        // Re-project nodes in moved clusters
        const clusterEdges = relationshipGraph.edges.filter(edge =>
          cluster.nodeIds.includes(edge.source) && cluster.nodeIds.includes(edge.target)
        );

        const layoutResult = computeClusterLayout(
          cluster,
          relationshipGraph.nodes,
          clusterEdges,
          config
        );

        if (layoutResult.positions.size > 0) {
          const tangentBasis = getTangentBasis(cluster.center);

          for (const [nodeId, planarPos] of layoutResult.positions) {
            const spherePos = exponentialMap(cluster.center, planarPos, tangentBasis);
            const scaledPos = scaleToSphere(spherePos, config.sphereRadius);
            nodePositions.set(nodeId, scaledPos);
          }
        }
      }
    }

    const endTime = performance.now();
    const computationTime = endTime - startTime;

    // Create statistics
    const stats: LayoutStatistics = {
      computationTimeMs: computationTime,
      totalClusters: clusters.length,
      totalNodes: nodePositions.size,
      totalEdges: relationshipGraph.edges.length,
      standaloneNodes: standaloneNodeIds.length,
      largestClusterSize: Math.max(...clusters.map(c => c.size)),
      averageClusterSize: clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length,
      refinementSuccessful: refinementResult.success
    };

    return {
      nodePositions,
      clusters: refinementResult.clusters,
      stats
    };

  } catch (error) {
    console.error('❌ [ConstellationLayout] Layout computation failed:', error);
    return createEmptyLayout(startTime);
  }
}

/**
 * Compute global positioning of clusters on the sphere surface
 *
 * Places cluster centers using Fibonacci distribution and calculates
 * cluster radii based on proportional area allocation.
 *
 * @param clusters Clusters with computed connectivity
 * @param config Layout configuration
 * @returns Clusters with positions and radii assigned
 */
function computeGlobalPositioning(
  clusters: ConstellationCluster[],
  config: ConstellationLayoutConfig
): ConstellationCluster[] {
  const totalSphereArea = 4 * Math.PI;
  const totalNodes = clusters.reduce((sum, cluster) => sum + cluster.size, 0);

  // Calculate cluster radii based on proportional area
  const updatedClusters = clusters.map(cluster => {
    const proportionalArea = config.coverageFactor * totalSphereArea * (cluster.size / totalNodes);
    const minArea = sphericalCapArea(config.minRadius);
    const area = Math.max(minArea, proportionalArea);
    const radius = areaToRadius(area);

    return {
      ...cluster,
      radius
    };
  });

  // Use Fibonacci distribution for cluster centers
  const fibonacciPoints = fibonacciSphere(clusters.length);

  // Sort clusters by size (largest first) for better placement
  const sortedClusters = [...updatedClusters].sort((a, b) => b.size - a.size);

  // Assign positions
  sortedClusters.forEach((cluster, index) => {
    cluster.center = fibonacciPoints[index];
  });

  return sortedClusters;
}

/**
 * Create an empty layout result for error cases
 */
function createEmptyLayout(startTime: number): ConstellationLayoutResult {
  const endTime = performance.now();

  return {
    nodePositions: new Map(),
    clusters: [],
    stats: {
      computationTimeMs: endTime - startTime,
      totalClusters: 0,
      totalNodes: 0,
      totalEdges: 0,
      standaloneNodes: 0,
      largestClusterSize: 0,
      averageClusterSize: 0,
      refinementSuccessful: true
    }
  };
}

/**
 * Validate that all nodes have positions
 *
 * @param dreamNodes All DreamNodes that should be positioned
 * @param nodePositions Computed positions
 * @returns Array of node IDs missing positions
 */
export function validateLayout(
  dreamNodes: DreamNode[],
  nodePositions: Map<string, [number, number, number]>
): string[] {
  const missingNodes: string[] = [];

  for (const node of dreamNodes) {
    if (!nodePositions.has(node.id)) {
      missingNodes.push(node.id);
    }
  }

  return missingNodes;
}

/**
 * Create a fallback layout using Fibonacci sphere for missing nodes
 *
 * @param dreamNodes All DreamNodes
 * @param existingPositions Already computed positions
 * @param config Layout configuration
 * @returns Complete set of positions with fallbacks
 */
export function createFallbackLayout(
  dreamNodes: DreamNode[],
  existingPositions: Map<string, [number, number, number]>,
  config: ConstellationLayoutConfig = DEFAULT_CONSTELLATION_CONFIG
): Map<string, [number, number, number]> {
  const finalPositions = new Map(existingPositions);
  const missingNodes = dreamNodes.filter(node => !finalPositions.has(node.id));

  if (missingNodes.length > 0) {
    const fallbackPoints = fibonacciSphere(missingNodes.length);
    missingNodes.forEach((node, index) => {
      const scaledPos = scaleToSphere(fallbackPoints[index], config.sphereRadius);
      finalPositions.set(node.id, scaledPos);
    });
  }

  return finalPositions;
}