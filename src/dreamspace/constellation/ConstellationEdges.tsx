/**
 * ConstellationEdges Component - Main Container for DreamSong Relationship Visualization
 *
 * Reads relationship graph from Zustand store and renders all DreamSong threads
 * as spherical arcs connecting DreamNodes on the sphere surface. Implements
 * connected components clustering for automatic color assignment.
 */

import React, { useMemo } from 'react';
import { Group } from 'three';
import { useInterBrainStore } from '../../store/interbrain-store';
import { DreamNode } from '../../types/dreamnode';
import { detectConnectedComponents, getClusterColor } from './clustering';
import DreamSongThread3D, { groupEdgesByDreamSong, sortEdgesBySequence } from './DreamSongThread3D';

export interface ConstellationEdgesProps {
  /** Array of DreamNodes for position lookup */
  dreamNodes: DreamNode[];

  /** Reference to the rotatable dream world group for rotation awareness */
  dreamWorldRef: React.RefObject<Group | null>;

  /** Whether to show edges (default: true) */
  showEdges?: boolean;

  /** Base opacity for all edges */
  opacity?: number;
}

export default function ConstellationEdges({
  dreamNodes,
  dreamWorldRef: _dreamWorldRef,
  showEdges = true,
  opacity = 0.6
}: ConstellationEdgesProps) {
  // Get relationship graph from store
  const relationshipGraph = useInterBrainStore(state => state.constellationData.relationshipGraph);

  // Create position lookup function
  const getNodePosition = useMemo(() => {
    const positionMap = new Map<string, [number, number, number]>();

    // Build position lookup from DreamNodes
    for (const node of dreamNodes) {
      positionMap.set(node.id, node.position);
    }

    return (nodeId: string): [number, number, number] | null => {
      return positionMap.get(nodeId) || null;
    };
  }, [dreamNodes]);

  // Perform clustering analysis
  const clusteringResult = useMemo(() => {
    if (!relationshipGraph) return null;

    return detectConnectedComponents(relationshipGraph);
  }, [relationshipGraph]);

  // Group edges by DreamSong for thread rendering
  const dreamSongThreads = useMemo(() => {
    if (!relationshipGraph || !clusteringResult) return [];

    const edgeGroups = groupEdgesByDreamSong(relationshipGraph.edges);
    const threads: Array<{
      dreamSongId: string;
      dreamSongPath: string;
      edges: typeof relationshipGraph.edges;
      color: string;
    }> = [];

    for (const [dreamSongId, edges] of edgeGroups) {
      // Sort edges by sequence index for proper rendering
      const sortedEdges = sortEdgesBySequence(edges);

      // Get first edge to determine thread color
      const firstEdge = sortedEdges[0];
      if (firstEdge) {
        // Use the source node's cluster color for the thread
        const threadColor = getClusterColor(firstEdge.source, clusteringResult);

        threads.push({
          dreamSongId,
          dreamSongPath: firstEdge.dreamSongPath,
          edges: sortedEdges,
          color: threadColor
        });
      }
    }

    return threads;
  }, [relationshipGraph, clusteringResult]);

  // Early return if no data or edges disabled
  if (!showEdges || !relationshipGraph || dreamSongThreads.length === 0) {
    return null;
  }

  console.log(`🌌 ConstellationEdges: Rendering ${dreamSongThreads.length} DreamSong threads with ${relationshipGraph.edges.length} total edges`);

  return (
    <group name="constellation-edges">
      {dreamSongThreads.map(({ dreamSongId, dreamSongPath, edges, color }) => (
        <DreamSongThread3D
          key={dreamSongId}
          edges={edges}
          dreamSongId={dreamSongId}
          dreamSongPath={dreamSongPath}
          color={color}
          opacity={opacity}
          getNodePosition={getNodePosition}
        />
      ))}
    </group>
  );
}

/**
 * Hook to get constellation statistics from the current relationship graph
 */
export function useConstellationStats() {
  const relationshipGraph = useInterBrainStore(state => state.constellationData.relationshipGraph);

  return useMemo(() => {
    if (!relationshipGraph) {
      return {
        totalNodes: 0,
        totalEdges: 0,
        totalDreamSongs: 0,
        standaloneNodes: 0,
        connectedNodes: 0,
        averageConnections: 0
      };
    }

    const totalNodes = relationshipGraph.nodes.size;
    const totalEdges = relationshipGraph.edges.length;
    const dreamSongIds = new Set(relationshipGraph.edges.map(e => e.dreamSongId));
    const totalDreamSongs = dreamSongIds.size;

    // Calculate connected vs standalone nodes
    const connectedNodeIds = new Set<string>();
    for (const edge of relationshipGraph.edges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }

    const connectedNodes = connectedNodeIds.size;
    const standaloneNodes = totalNodes - connectedNodes;
    const averageConnections = totalNodes > 0 ? (totalEdges * 2) / totalNodes : 0; // Each edge connects 2 nodes

    return {
      totalNodes,
      totalEdges,
      totalDreamSongs,
      standaloneNodes,
      connectedNodes,
      averageConnections: Math.round(averageConnections * 100) / 100 // Round to 2 decimal places
    };
  }, [relationshipGraph]);
}

/**
 * Utility to check if constellation edges should be visible based on layout
 */
export function shouldShowConstellationEdges(spatialLayout: string): boolean {
  // Show edges in constellation mode, hide in other modes for performance
  return spatialLayout === 'constellation';
}