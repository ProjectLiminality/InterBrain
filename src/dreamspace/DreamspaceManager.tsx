import React, { useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { DreamNode } from '../types/dreamnode';
import DreamNode3D from './DreamNode3D';
import SimpleStar from './SimpleStar';

interface DreamspaceManagerProps {
  dreamNodes: DreamNode[];
  onNodeHover?: (node: DreamNode, isHovered: boolean) => void;
  onNodeClick?: (node: DreamNode) => void;
  onNodeDoubleClick?: (node: DreamNode) => void;
}

interface NodeLOD {
  node: DreamNode;
  inAttentionZone: boolean;
  angle: number;
}

/**
 * Efficient LOD manager that only renders full DreamNode components
 * for nodes within the attention zone. Distant nodes are simple stars.
 */
export default function DreamspaceManager({
  dreamNodes,
  onNodeHover,
  onNodeClick,
  onNodeDoubleClick
}: DreamspaceManagerProps) {
  const [nodeLODs, setNodeLODs] = useState<NodeLOD[]>(
    dreamNodes.map(node => ({
      node,
      inAttentionZone: false,
      angle: 180
    }))
  );

  const { camera } = useThree();

  // Single camera calculation per frame for all nodes
  useFrame(() => {
    // Get camera forward direction once
    const cameraDirection = new Vector3(0, 0, -1);
    cameraDirection.applyQuaternion(camera.quaternion);

    // Calculate LOD for all nodes in a single pass
    const newNodeLODs = dreamNodes.map(dreamNode => {
      const spherePosition = new Vector3(...dreamNode.position);
      const nodeDirection = spherePosition.clone().normalize();
      const dotProduct = cameraDirection.dot(nodeDirection);
      
      // Convert to angle in degrees
      const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI);
      
      // Attention threshold - slightly larger than node's internal threshold
      const attentionThreshold = 50; // 50 degrees to give some buffer
      
      return {
        node: dreamNode,
        inAttentionZone: angle < attentionThreshold,
        angle
      };
    });

    setNodeLODs(newNodeLODs);
  });

  return (
    <>
      {nodeLODs.map(({ node, inAttentionZone }) => (
        inAttentionZone ? (
          // Full DreamNode component for nodes in attention zone
          <DreamNode3D
            key={`dreamnode-${node.id}`}
            dreamNode={node}
            onHover={onNodeHover}
            onClick={onNodeClick}
            onDoubleClick={onNodeDoubleClick}
          />
        ) : (
          // Simple star for distant nodes
          <SimpleStar
            key={`star-${node.id}`}
            dreamNode={node}
            onClick={onNodeClick}
          />
        )
      ))}
    </>
  );
}