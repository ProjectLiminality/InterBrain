import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group, Mesh } from 'three';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { calculateDynamicScaling, DEFAULT_SCALING_CONFIG } from '../dreamspace/DynamicViewScaling';
import { useInterBrainStore } from '../store/interbrain-store';
import { dreamNodeStyles, getNodeColors, getNodeGlow, getMediaContainerStyle, getMediaOverlayStyle, getGitVisualState, getGitStateStyle, getGitGlow } from './dreamNodeStyles';
import './dreamNodeAnimations.css';

interface DreamNode3DProps {
  dreamNode: DreamNode;
  onHover?: (node: DreamNode, isHovered: boolean) => void;
  onClick?: (node: DreamNode) => void;
  onDoubleClick?: (node: DreamNode) => void;
  enableDynamicScaling?: boolean;
  onHitSphereRef?: (nodeId: string, meshRef: React.RefObject<Mesh | null>) => void;
}

/**
 * 3D DreamNode component with constant size for foundational development
 * 
 * Features:
 * - Fixed 240px size for consistent visual development
 * - Static positioning on Fibonacci sphere
 * - Clean interaction patterns (hover, click, double-click)
 * - Color coding: blue for Dreams, red for Dreamers
 */
export default function DreamNode3D({ 
  dreamNode, 
  onHover, 
  onClick, 
  onDoubleClick,
  enableDynamicScaling = false,
  onHitSphereRef
}: DreamNode3DProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [radialOffset, setRadialOffset] = useState(0);
  const groupRef = useRef<Group>(null);
  const hitSphereRef = useRef<Mesh>(null);
  
  // Check global drag state to prevent hover interference during sphere rotation
  const isDragging = useInterBrainStore(state => state.isDragging);
  
  // Check if this node is selected
  const selectedNode = useInterBrainStore(state => state.selectedNode);
  const isSelected = selectedNode?.id === dreamNode.id;

  // Register hit sphere reference with parent component
  useEffect(() => {
    if (onHitSphereRef && hitSphereRef) {
      onHitSphereRef(dreamNode.id, hitSphereRef);
    }
  }, [dreamNode.id, onHitSphereRef]);

  // Handle mouse events (suppress during sphere rotation to prevent interference)
  const handleMouseEnter = () => {
    if (isDragging) {
      return; // Suppress hover during drag operations
    }
    setIsHovered(true);
    onHover?.(dreamNode, true);
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      return; // Suppress hover during drag operations
    }
    setIsHovered(false);
    onHover?.(dreamNode, false);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return; // Suppress click during drag operations
    e.stopPropagation();
    onClick?.(dreamNode);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isDragging) return; // Suppress double-click during drag operations
    e.stopPropagation();
    onDoubleClick?.(dreamNode);
  };
  
  // Calculate dynamic scaling on every frame when enabled
  useFrame(() => {
    if (enableDynamicScaling && groupRef.current) {
      // Get world position of the anchor (includes rotation from parent group)
      const worldPosition = new Vector3();
      groupRef.current.getWorldPosition(worldPosition);
      
      // But we need to get the world position of the ANCHOR, not the current final position
      // So we need to calculate where the anchor would be in world space
      const anchorGroup = groupRef.current.parent; // Get the rotatable group
      const anchorVector = new Vector3(anchorPosition[0], anchorPosition[1], anchorPosition[2]);
      if (anchorGroup) {
        anchorGroup.localToWorld(anchorVector);
      }
      
      // Calculate dynamic scaling based on anchor's world position
      const { radialOffset: newRadialOffset } = calculateDynamicScaling(
        anchorVector,
        DEFAULT_SCALING_CONFIG
      );
      
      // Update state if changed
      if (radialOffset !== newRadialOffset) {
        setRadialOffset(newRadialOffset);
      }
    }
  });

  // Get consistent colors from shared styles
  const nodeColors = getNodeColors(dreamNode.type);
  
  // Get git visual state and styling
  const gitState = getGitVisualState(dreamNode.gitStatus);
  const gitStyle = getGitStateStyle(gitState);
  
  // Base size for 3D scaling - will scale with distance due to distanceFactor
  const nodeSize = dreamNodeStyles.dimensions.nodeSizeThreeD;
  const borderWidth = dreamNodeStyles.dimensions.borderWidth; // Use shared border width
  
  // Calculate visual component position with radial offset
  // Anchor point stays at dreamNode.position, visual component moves radially toward camera
  const anchorPosition = dreamNode.position;
  
  // Calculate normalized direction toward origin (radially inward)
  const normalizedDirection = useMemo(() => {
    const direction = [
      -anchorPosition[0], // Direction toward origin (radially inward)
      -anchorPosition[1],
      -anchorPosition[2]
    ];
    const directionLength = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
    return [
      direction[0] / directionLength,
      direction[1] / directionLength,
      direction[2] / directionLength
    ];
  }, [anchorPosition]);
  
  // Calculate final position (anchor + radial offset)
  const finalPosition = useMemo(() => [
    anchorPosition[0] - normalizedDirection[0] * radialOffset,
    anchorPosition[1] - normalizedDirection[1] * radialOffset,
    anchorPosition[2] - normalizedDirection[2] * radialOffset
  ] as [number, number, number], [anchorPosition, normalizedDirection, radialOffset]);
  
  // Using sprite mode for automatic billboarding - no manual rotation needed
  
  // Debug logging removed for cleaner console
  
  // Wrap in group at final position for world position calculations
  // Apply hover scaling to the entire group so both visual and hit detection scale together
  return (
    <group 
      ref={groupRef} 
      position={finalPosition}
    >
      {/* DreamNode rendering - always visible */}
        <Html
          position={[0, 0, 0]}
          center
          transform  // Enable 3D transformations
          sprite     // Always face camera (billboarding)
          distanceFactor={10}  // Scale based on distance from camera
          style={{
            pointerEvents: isDragging ? 'none' : 'auto', // Disable all mouse events during drag
            userSelect: 'none'
          }}
        >
      <div
        style={{
          width: `${nodeSize}px`,
          height: `${nodeSize}px`,
          borderRadius: dreamNodeStyles.dimensions.borderRadius,
          border: `${borderWidth}px ${gitStyle.borderStyle} ${nodeColors.border}`,
          background: nodeColors.fill,
          overflow: 'hidden',
          position: 'relative',
          cursor: 'pointer',
          transition: `${dreamNodeStyles.transitions.default}, ${dreamNodeStyles.transitions.gitState}`,
          transform: isSelected ? `scale(1.15)` : (isHovered ? `scale(${dreamNodeStyles.states.hover.scale})` : 'scale(1)'),
          animation: gitStyle.animation,
          boxShadow: isSelected 
            ? '0 0 40px #FFD700, 0 0 80px #FFD700'  // Strong gold glow when selected
            : (gitStyle.glowIntensity > 0 
              ? getGitGlow(gitState, gitStyle.glowIntensity)
              : (isHovered ? getNodeGlow(dreamNode.type, dreamNodeStyles.states.hover.glowIntensity) : 'none'))
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* DreamTalk Media Container */}
        {dreamNode.dreamTalkMedia[0] && (
          <div style={getMediaContainerStyle()}>
            <MediaRenderer media={dreamNode.dreamTalkMedia[0]} />
            {/* Fade-to-black overlay */}
            <div style={getMediaOverlayStyle()} />
          </div>
        )}

        {/* Empty state text - when no media */}
        {!dreamNode.dreamTalkMedia[0] && (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: dreamNodeStyles.colors.text.primary,
              fontFamily: dreamNodeStyles.typography.fontFamily,
              fontSize: `${Math.max(12, nodeSize * 0.08)}px`,
              textAlign: 'center',
              padding: '8px'
            }}
          >
            {dreamNode.name}
          </div>
        )}


        {/* Node label */}
        <div
          style={{
            position: 'absolute',
            bottom: `-${nodeSize * 0.25}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            color: dreamNodeStyles.colors.text.primary,
            fontFamily: dreamNodeStyles.typography.fontFamily,
            fontSize: `${Math.max(12, nodeSize * 0.1)}px`,
            textAlign: 'center',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '4px 8px',
            borderRadius: '4px',
            whiteSpace: 'nowrap',
            pointerEvents: 'none'
          }}
        >
          {dreamNode.name}
        </div>
      </div>
    </Html>
    
    {/* Invisible hit detection sphere - travels with visual node as unified object */}
    <mesh 
      ref={hitSphereRef}
      position={[0, 0, 0]}
      userData={{ dreamNodeId: dreamNode.id, dreamNode: dreamNode }}
    >
      <sphereGeometry args={[12, 8, 8]} />
      <meshBasicMaterial 
        transparent={true} 
        opacity={0}
      />
    </mesh>
    </group>
  );
}

/**
 * Renders different types of media in the DreamTalk circle
 */
function MediaRenderer({ media }: { media: MediaFile }) {
  const mediaStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    borderRadius: '50%'
  };

  if (media.type.startsWith('image/')) {
    return (
      <img 
        src={media.data} 
        alt="DreamTalk symbol"
        style={mediaStyle}
        draggable={false}
      />
    );
  }

  if (media.type.startsWith('video/')) {
    return (
      <video 
        src={media.data}
        style={mediaStyle}
        muted
        loop
        autoPlay
        playsInline
      />
    );
  }

  if (media.type.startsWith('audio/')) {
    return (
      <div
        style={{
          ...mediaStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)'
        }}
      >
        <audio 
          controls 
          src={media.data}
          style={{ 
            width: '90%', 
            maxWidth: '80px',
            filter: 'invert(1)'
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...mediaStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontSize: '10px',
        background: 'rgba(0, 0, 0, 0.8)'
      }}
    >
      {media.type}
    </div>
  );
}