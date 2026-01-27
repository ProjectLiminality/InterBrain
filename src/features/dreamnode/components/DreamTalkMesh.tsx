/**
 * DreamTalkMesh Component
 *
 * WebGL-native rendering of DreamTalk (front face of DreamNode).
 * Replaces DOM-based DreamTalkSide for better performance.
 *
 * Architecture:
 * - Circular mesh with media texture
 * - Ring mesh for border
 * - Glow ring (when active)
 * - Text label below
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { DreamNode } from '../types/dreamnode';
import { useMediaTexture } from '../hooks/useMediaTexture';
import { dreamNodeStyles, getNodeColors } from '../styles/dreamNodeStyles';

interface DreamTalkMeshProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isPendingRelationship: boolean;
  isTutorialHighlighted: boolean;
  glowIntensity: number;
  nodeSize: number;
  borderWidth: number;
  mediaLoadTrigger?: number; // Trigger to re-evaluate media when loaded asynchronously
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onClick?: (e: THREE.Event) => void;
  onDoubleClick?: (e: THREE.Event) => void;
}

// Constants for mesh geometry
const CIRCLE_SEGMENTS = 64;
const RING_SEGMENTS = 64;

export const DreamTalkMesh: React.FC<DreamTalkMeshProps> = ({
  dreamNode,
  isHovered,
  isPendingRelationship,
  isTutorialHighlighted,
  glowIntensity,
  nodeSize,
  borderWidth,
  mediaLoadTrigger,
  onPointerEnter,
  onPointerLeave,
  onClick,
  onDoubleClick
}) => {
  // Load media as texture (pass trigger to re-evaluate when media loads async)
  const { texture, isLoading } = useMediaTexture(dreamNode, mediaLoadTrigger);

  // Get colors based on node type
  const nodeColors = getNodeColors(dreamNode.type);

  // Calculate sizes - match the scale of the Html component
  // Html uses distanceFactor=10 which scales content based on camera distance
  // Tuned for visual parity with HTML rendering (3x smaller than /20)
  const radius = nodeSize / 80;
  const borderThickness = borderWidth / 80;
  const innerRadius = radius - borderThickness;

  // Refs for animated elements
  const glowRef = useRef<THREE.Mesh>(null);

  // Determine if glow should show
  const shouldShowGlow = isPendingRelationship || isTutorialHighlighted || isHovered;

  // Animate glow
  useFrame(() => {
    if (glowRef.current) {
      const targetOpacity = shouldShowGlow ? glowIntensity * 0.5 : 0;
      const material = glowRef.current.material as THREE.MeshBasicMaterial;
      material.opacity += (targetOpacity - material.opacity) * 0.1;
    }
  });

  // Memoize geometries
  const circleGeometry = useMemo(
    () => new THREE.CircleGeometry(innerRadius, CIRCLE_SEGMENTS),
    [innerRadius]
  );

  const ringGeometry = useMemo(
    () => new THREE.RingGeometry(innerRadius, radius, RING_SEGMENTS),
    [innerRadius, radius]
  );

  const glowGeometry = useMemo(
    () => new THREE.RingGeometry(radius, radius * 1.15, RING_SEGMENTS),
    [radius]
  );

  // Parse colors
  const borderColor = useMemo(() => new THREE.Color(nodeColors.border), [nodeColors.border]);
  const fillColor = useMemo(() => new THREE.Color(nodeColors.fill), [nodeColors.fill]);
  const glowColor = useMemo(() => new THREE.Color('#FFD700'), []); // Golden glow

  return (
    <group position={[0, 0, 0.01]}>
      {/* Glow ring (behind everything) */}
      <mesh
        ref={glowRef}
        position={[0, 0, -0.002]}
        geometry={glowGeometry}
      >
        <meshBasicMaterial
          color={glowColor}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Border ring */}
      <mesh
        position={[0, 0, -0.001]}
        geometry={ringGeometry}
      >
        <meshBasicMaterial color={borderColor} side={THREE.DoubleSide} />
      </mesh>

      {/* Media circle - use texture if available, otherwise fill color */}
      <mesh
        position={[0, 0, 0]}
        geometry={circleGeometry}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {texture ? (
          <meshBasicMaterial
            map={texture}
            side={THREE.DoubleSide}
            transparent
          />
        ) : (
          <meshBasicMaterial
            color={fillColor}
            side={THREE.DoubleSide}
          />
        )}
      </mesh>

      {/* Hover overlay */}
      {(isHovered || isPendingRelationship || isTutorialHighlighted) && (
        <mesh position={[0, 0, 0.001]} geometry={circleGeometry}>
          <meshBasicMaterial
            color={0x000000}
            transparent
            opacity={0.7}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Name text on hover overlay */}
      {(isHovered || isPendingRelationship || isTutorialHighlighted) && (
        <Text
          position={[0, 0, 0.002]}
          fontSize={radius * 0.15}
          color={dreamNodeStyles.colors.text.primary}
          anchorX="center"
          anchorY="middle"
          maxWidth={innerRadius * 1.8}
        >
          {dreamNode.name}
        </Text>
      )}

      {/* Name label below */}
      <Text
        position={[0, -radius - radius * 0.2, 0]}
        fontSize={radius * 0.12}
        color={dreamNodeStyles.colors.text.primary}
        anchorX="center"
        anchorY="top"
        maxWidth={radius * 2.5}
      >
        {dreamNode.name}
      </Text>

      {/* Loading indicator */}
      {isLoading && (
        <Text
          position={[0, 0, 0.002]}
          fontSize={radius * 0.1}
          color="#666666"
          anchorX="center"
          anchorY="middle"
        >
          ...
        </Text>
      )}
    </group>
  );
};

export default DreamTalkMesh;
