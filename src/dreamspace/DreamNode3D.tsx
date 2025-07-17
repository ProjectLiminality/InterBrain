import React, { useState, useRef, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Vector3, Group } from 'three';
import { DreamNode, MediaFile } from '../types/dreamnode';
import { calculateDynamicScaling, DEFAULT_SCALING_CONFIG } from '../dreamspace/DynamicViewScaling';
import { useInterBrainStore } from '../store/interbrain-store';

interface DreamNode3DProps {
  dreamNode: DreamNode;
  onHover?: (node: DreamNode, isHovered: boolean) => void;
  onClick?: (node: DreamNode) => void;
  onDoubleClick?: (node: DreamNode) => void;
  enableDynamicScaling?: boolean;
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
  enableDynamicScaling = false
}: DreamNode3DProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [radialOffset, setRadialOffset] = useState(0);
  const groupRef = useRef<Group>(null);
  
  // Check global drag state to prevent hover interference during sphere rotation
  const isDragging = useInterBrainStore(state => state.isDragging);

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

  // Color coding: blue for Dreams, red for Dreamers
  const borderColor = dreamNode.type === 'dream' ? '#00a2ff' : '#FF644E';
  
  // Base size for 3D scaling - will scale with distance due to distanceFactor
  const nodeSize = 1000; // Base size since it will scale down significantly with distance
  const borderWidth = Math.max(1, nodeSize * 0.04); // ~10px border
  
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
  return (
    <group ref={groupRef} position={finalPosition}>
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
          borderRadius: '50%',
          border: `${borderWidth}px solid ${borderColor}`,
          background: '#000000',
          overflow: 'hidden',
          position: 'relative',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          transform: isHovered ? 'scale(1.1)' : 'scale(1)',
          boxShadow: isHovered 
            ? `0 0 20px ${borderColor}` 
            : `0 0 10px rgba(${borderColor.slice(1)}, 0.5)`
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* DreamTalk Media Container */}
        {dreamNode.dreamTalkMedia[0] && (
          <div
            style={{
              width: '80%',
              height: '80%',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              overflow: 'hidden',
              background: 'rgba(0, 0, 0, 0.8)'
            }}
          >
            <MediaRenderer media={dreamNode.dreamTalkMedia[0]} />
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
              color: '#FFFFFF',
              fontSize: `${Math.max(12, nodeSize * 0.08)}px`,
              textAlign: 'center',
              padding: '8px'
            }}
          >
            {dreamNode.name}
          </div>
        )}

        {/* Circular fade overlay */}
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: '10%',
            width: '80%',
            height: '80%',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,1) 70%)',
            pointerEvents: 'none'
          }}
        />

        {/* Node label */}
        <div
          style={{
            position: 'absolute',
            bottom: `-${nodeSize * 0.25}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#FFFFFF',
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