import React, { useState, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { DreamNode, VisualState, MediaFile } from '../types/dreamnode';

interface DreamNode3DProps {
  dreamNode: DreamNode;
  onHover?: (node: DreamNode, isHovered: boolean) => void;
  onClick?: (node: DreamNode) => void;
  onDoubleClick?: (node: DreamNode) => void;
}

/**
 * 3D DreamNode component with "attention-based" positioning
 * 
 * Features:
 * - Stars fixed on Fibonacci sphere as "night sky"
 * - DreamNodes emerge and approach when looked at
 * - Smooth transitions between star/node states
 * - Distance-based rendering for performance
 */
export default function DreamNode3D({ 
  dreamNode, 
  onHover, 
  onClick, 
  onDoubleClick 
}: DreamNode3DProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [visualState, setVisualState] = useState<VisualState>({
    lod: 'star',
    scale: 1,
    billboard: true,
    distanceFromCamera: 1000,
    isHovered: false,
    isSelected: false
  });
  
  // Dynamic position that moves along ray from sphere to camera
  const [dynamicPosition, setDynamicPosition] = useState<[number, number, number]>(dreamNode.position);
  
  const { camera } = useThree();
  
  // Fixed position on Fibonacci sphere (for star)
  const spherePosition = new Vector3(...dreamNode.position);
  const sphereRadius = spherePosition.length();
  
  // Throttled frame update for performance
  let frameCount = useRef(0);
  const updateFrequency = 2; // Update every 2nd frame
  
  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % updateFrequency !== 0) return;
    
    // Get camera forward direction
    const cameraDirection = new Vector3(0, 0, -1);
    cameraDirection.applyQuaternion(camera.quaternion);
    
    // Calculate angle between camera direction and node direction
    const nodeDirection = spherePosition.clone().normalize();
    const dotProduct = cameraDirection.dot(nodeDirection);
    
    // Convert to angle in degrees (0-90, where 0 is directly ahead)
    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI);
    
    // Threshold for attention (degrees from center of view)
    const attentionThreshold = 30; // 30 degrees from center
    const starThreshold = 45; // 45 degrees = definitely a star
    
    // Calculate how centered the node is (0 = edge, 1 = perfect center)
    const centeredness = Math.max(0, 1 - (angle / attentionThreshold));
    
    // Determine LOD and position based on attention
    let lod: VisualState['lod'] = 'star';
    let targetDistance = sphereRadius; // Default: stay on sphere
    
    if (angle < starThreshold) {
      if (angle < attentionThreshold) {
        lod = 'node';
        // Move closer based on how centered it is
        // At perfect center (centeredness=1), come very close (20% of sphere radius)
        // At edge (centeredness=0), stay at sphere
        const minDistance = sphereRadius * 0.2;
        targetDistance = sphereRadius - (centeredness * (sphereRadius - minDistance));
        
        // If very centered and close, show detailed view
        if (centeredness > 0.8 && targetDistance < sphereRadius * 0.4) {
          lod = 'detailed';
        }
      }
    }
    
    // Calculate new position along ray
    const rayDirection = spherePosition.clone().normalize();
    const newPosition = rayDirection.multiplyScalar(targetDistance);
    
    // Smooth position transition
    setDynamicPosition(prev => {
      const current = new Vector3(...prev);
      current.lerp(newPosition, 0.1); // Smooth interpolation
      return [current.x, current.y, current.z];
    });
    
    setVisualState(prev => ({
      ...prev,
      lod,
      scale: 1, // No scaling needed - using distance instead
      distanceFromCamera: targetDistance,
      isHovered
    }));
  });

  // Handle mouse events
  const handleMouseEnter = () => {
    setIsHovered(true);
    onHover?.(dreamNode, true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHover?.(dreamNode, false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(dreamNode);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClick?.(dreamNode);
  };

  // Color coding: blue for Dreams, red for Dreamers
  const borderColor = dreamNode.type === 'dream' ? '#00a2ff' : '#FF644E';
  
  // Always render star at sphere position
  const starElement = (
    <Html
      position={dreamNode.position} // Fixed sphere position
      center
      sprite
      style={{
        pointerEvents: visualState.lod === 'star' ? 'auto' : 'none',
        userSelect: 'none',
        opacity: visualState.lod === 'star' ? 1 : 0,
        transition: 'opacity 0.3s ease'
      }}
    >
      <div
        style={{
          width: '3px',
          height: '3px',
          borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: `
            0 0 6px ${borderColor},
            0 0 12px ${borderColor},
            0 0 18px ${borderColor}
          `,
          cursor: 'pointer',
          opacity: 0.9
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      />
    </Html>
  );
  
  // DreamNode rendering (only when node or detailed)
  const nodeElement = (visualState.lod === 'node' || visualState.lod === 'detailed') ? (
    <Html
      position={dynamicPosition} // Dynamic position that moves
      center
      sprite
      style={{
        pointerEvents: 'auto',
        userSelect: 'none',
        opacity: (visualState.lod === 'node' || visualState.lod === 'detailed') ? 1 : 0,
        transition: 'opacity 0.3s ease'
      }}
    >
      <div
        className="dreamnode-container"
        style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          border: `5px solid ${borderColor}`,
          background: '#000000',
          overflow: 'hidden',
          position: 'relative',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          transform: isHovered ? 'scale(1.1)' : 'scale(1)',
          boxShadow: isHovered 
            ? `0 0 20px ${borderColor}` 
            : `0 0 10px rgba(${borderColor}, 0.5)`
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* DreamTalk Media Container */}
        <div
          className="dreamtalk-media"
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
          {dreamNode.dreamTalkMedia[0] ? (
            <MediaRenderer media={dreamNode.dreamTalkMedia[0]} />
          ) : (
            // Empty state - just show node name
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontSize: '12px',
                textAlign: 'center',
                padding: '8px'
              }}
            >
              {dreamNode.name}
            </div>
          )}
        </div>

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

        {/* Node name label (appears on detailed view) */}
        {visualState.lod === 'detailed' && (
          <div
            style={{
              position: 'absolute',
              bottom: '-30px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: '#FFFFFF',
              fontSize: '14px',
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
        )}
      </div>
    </Html>
  ) : null;
  
  // Render both elements - visibility controlled by opacity
  return (
    <>
      {starElement}
      {nodeElement}
    </>
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

  // Handle different media types
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

  // Fallback
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