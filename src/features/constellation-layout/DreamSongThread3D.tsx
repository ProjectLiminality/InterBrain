/**
 * DreamSongThread3D Component - Grouping Multiple Edges from Same DreamSong
 *
 * Renders multiple relationship edges that originate from the same DreamSong canvas,
 * providing unified interaction behavior and visual styling. When clicked, selects
 * the DreamNode that owns the DreamSong.
 */

import React, { useState, useMemo } from 'react';
import { DreamSongEdge } from './types';
import { useInterBrainStore } from '../../core/store/interbrain-store';
import Edge3D, { isValidEdge } from './Edge3D';

export interface DreamSongThread3DProps {
  /** Array of edges that belong to this DreamSong */
  edges: DreamSongEdge[];

  /** Unique identifier for this DreamSong */
  dreamSongId: string;

  /** Path to the DreamSong canvas file */
  dreamSongPath: string;

  /** Visual color for all edges in this thread */
  color: string;

  /** Base opacity for edges */
  opacity?: number;

  /** Function to get DreamNode position by ID */
  getNodePosition: (nodeId: string) => [number, number, number] | null;
}

export default function DreamSongThread3D({
  edges,
  dreamSongId,
  dreamSongPath,
  color,
  opacity = 0.6,
  getNodePosition
}: DreamSongThread3DProps) {
  // Thread-level hover state
  const [isThreadHovered, setIsThreadHovered] = useState(false);

  // Store access for selecting DreamNode
  const setSelectedNode = useInterBrainStore(state => state.setSelectedNode);
  const setSpatialLayout = useInterBrainStore(state => state.setSpatialLayout);
  const realNodes = useInterBrainStore(state => state.realNodes);

  // Find the DreamNode that owns this DreamSong
  const ownerNode = useMemo(() => {
    // Extract DreamNode ID from DreamSong path
    // Path format: "DreamNodeFolder/DreamSong.canvas"
    const pathParts = dreamSongPath.split('/');
    const dreamNodeFolder = pathParts[pathParts.length - 2]; // Get parent folder name

    // Find the node by matching folder name in path
    for (const [, nodeData] of realNodes) {
      const nodeFolderName = nodeData.node.name.replace(/\s+/g, ''); // Remove spaces for folder matching
      if (dreamNodeFolder === nodeFolderName ||
          dreamNodeFolder === nodeData.node.name) {
        return nodeData.node;
      }
    }

    return null;
  }, [dreamSongPath, realNodes]);

  // Generate valid edges with positions
  const validEdges = useMemo(() => {
    const edgesWithPositions: Array<{
      edge: DreamSongEdge;
      sourcePosition: [number, number, number];
      targetPosition: [number, number, number];
    }> = [];

    for (const edge of edges) {
      const sourcePosition = getNodePosition(edge.source);
      const targetPosition = getNodePosition(edge.target);

      if (sourcePosition && targetPosition && isValidEdge(sourcePosition, targetPosition)) {
        edgesWithPositions.push({
          edge,
          sourcePosition,
          targetPosition
        });
      }
    }

    return edgesWithPositions;
  }, [edges, getNodePosition]);

  // Handle thread selection
  const handleThreadClick = () => {
    if (ownerNode) {
      console.log(`🎯 DreamSongThread clicked: Selecting owner DreamNode "${ownerNode.name}"`);

      // Select the owner DreamNode and switch to liminal-web layout
      setSelectedNode(ownerNode);
      setSpatialLayout('liminal-web');
    } else {
      console.warn(`⚠️ Could not find owner DreamNode for DreamSong: ${dreamSongPath}`);
    }
  };

  // Thread hover handlers
  const handleThreadPointerEnter = () => {
    setIsThreadHovered(true);
  };

  const handleThreadPointerLeave = () => {
    setIsThreadHovered(false);
  };

  // Don't render if no valid edges
  if (validEdges.length === 0) {
    return null;
  }

  return (
    <group name={`dreamsong-thread-${dreamSongId}`}>
      {validEdges.map(({ edge, sourcePosition, targetPosition }, index) => (
        <Edge3D
          key={`${edge.dreamSongId}-${edge.source}-${edge.target}-${index}`}
          sourcePosition={sourcePosition}
          targetPosition={targetPosition}
          color={color}
          opacity={opacity}
          isHovered={isThreadHovered}
          onClick={handleThreadClick}
          onPointerEnter={handleThreadPointerEnter}
          onPointerLeave={handleThreadPointerLeave}
        />
      ))}
    </group>
  );
}

/**
 * Utility to extract DreamNode ID from DreamSong path
 */
export function extractDreamNodeIdFromPath(dreamSongPath: string): string | null {
  // Expected path format: "DreamNodeFolder/DreamSong.canvas"
  const pathParts = dreamSongPath.split('/');

  if (pathParts.length >= 2) {
    return pathParts[pathParts.length - 2]; // Parent folder name
  }

  return null;
}

/**
 * Group edges by DreamSong ID for efficient rendering
 */
export function groupEdgesByDreamSong(edges: DreamSongEdge[]): Map<string, DreamSongEdge[]> {
  const groups = new Map<string, DreamSongEdge[]>();

  for (const edge of edges) {
    const existingGroup = groups.get(edge.dreamSongId);
    if (existingGroup) {
      existingGroup.push(edge);
    } else {
      groups.set(edge.dreamSongId, [edge]);
    }
  }

  return groups;
}

/**
 * Sort edges within a thread by their sequence index for proper rendering order
 */
export function sortEdgesBySequence(edges: DreamSongEdge[]): DreamSongEdge[] {
  return [...edges].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
}