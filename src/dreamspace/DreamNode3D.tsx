import React, { useState, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { DreamNode, MediaFile } from '../types/dreamnode';

interface DreamNode3DProps {
  dreamNode: DreamNode;
  onHover?: (node: DreamNode, isHovered: boolean) => void;
  onClick?: (node: DreamNode) => void;
  onDoubleClick?: (node: DreamNode) => void;
}

/**
 * 3D DreamNode component with continuous attention-based scaling
 * 
 * Features:
 * - Smooth scaling from tiny star to full DreamNode
 * - Continuous size based on how centered node is in view
 * - Smooth position transitions along ray from sphere to camera
 * - No discrete jumps - everything interpolated smoothly
 */
export default function DreamNode3D({ 
  dreamNode, 
  onHover, 
  onClick, 
  onDoubleClick 
}: DreamNode3DProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  // Continuous scale state (0 = tiny star, 1 = full node)
  const [scale, setScale] = useState(0);
  const [centeredness, setCenteredness] = useState(0);
  
  // Dynamic position that moves along ray from sphere to camera
  const [dynamicPosition, setDynamicPosition] = useState<[number, number, number]>(dreamNode.position);
  
  // Change-based logging with frame tracking
  const [lastLoggedValues, setLastLoggedValues] = useState({ angle: 0, scale: 0 });
  const [framesSinceChange, setFramesSinceChange] = useState(0);
  const lastFrameTime = useRef(Date.now());
  
  const { camera } = useThree();
  
  // Fixed position on Fibonacci sphere
  const spherePosition = new Vector3(...dreamNode.position);
  const sphereRadius = spherePosition.length();
  
  // Real-time frame updates for smooth multi-node scaling
  useFrame(() => {
    
    // Get camera forward direction
    const cameraDirection = new Vector3(0, 0, -1);
    cameraDirection.applyQuaternion(camera.quaternion);
    
    // Calculate angle between camera direction and node direction
    const nodeDirection = spherePosition.clone().normalize();
    const dotProduct = cameraDirection.dot(nodeDirection);
    
    // Convert to angle in degrees (0-90, where 0 is directly ahead)
    const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct))) * (180 / Math.PI);
    
    // Attention thresholds
    const maxAttentionAngle = 45; // 45 degrees from center - start growing
    const fullSizeAngle = 15; // 15 degrees from center - reach full size and stay there
    
    // Calculate centeredness with deadzone
    let centeredness = 0;
    if (angle <= fullSizeAngle) {
      // Within deadzone - full size (1.0)
      centeredness = 1.0;
    } else if (angle <= maxAttentionAngle) {
      // Transition zone - scale from full size down to zero
      const transitionProgress = (angle - fullSizeAngle) / (maxAttentionAngle - fullSizeAngle);
      centeredness = 1.0 - transitionProgress;
    }
    // Outside maxAttentionAngle = centeredness stays 0
    
    // Apply smoother easing curve for higher resolution scaling
    let easedCenteredness;
    if (angle <= fullSizeAngle) {
      easedCenteredness = 1.0;
    } else {
      // Smoother easing: smoothstep function (3t² - 2t³) instead of cubic
      const t = centeredness;
      easedCenteredness = t * t * (3 - 2 * t);
    }
    
    // High-resolution direct updates (no interpolation)
    setCenteredness(easedCenteredness);
    setScale(easedCenteredness);
    
    // Change-based console feedback for smoothness debugging
    const currentTime = Date.now();
    lastFrameTime.current = currentTime;
    
    // Check if values have changed significantly (threshold to avoid float precision noise)
    const angleChanged = Math.abs(angle - lastLoggedValues.angle) > 0.1;
    const scaleChanged = Math.abs(easedCenteredness - lastLoggedValues.scale) > 0.001;
    
    if (easedCenteredness > 0.01) { // Only track when visible
      if (angleChanged || scaleChanged) {
        // Log the change with time information
        const timeInfo = framesSinceChange > 0 ? ` (${framesSinceChange} frames, ${(framesSinceChange * 16.67).toFixed(0)}ms since last change)` : '';
        console.log(`[${dreamNode.name}] angle: ${angle.toFixed(1)}° | scale: ${easedCenteredness.toFixed(3)}${timeInfo}`);
        
        // Update tracked values and reset frame counter
        setLastLoggedValues({ angle, scale: easedCenteredness });
        setFramesSinceChange(0);
      } else {
        // Increment frame counter for unchanged values
        setFramesSinceChange(prev => prev + 1);
      }
    }
    
    // Continuous position - move closer based on attention
    // At center: come close (20% of radius), at edge: stay on sphere
    const minDistance = sphereRadius * 0.15; // Come even closer for more drama
    const targetDistance = sphereRadius - (easedCenteredness * (sphereRadius - minDistance));
    
    // Calculate new position along ray
    const rayDirection = spherePosition.clone().normalize();
    const newPosition = rayDirection.multiplyScalar(targetDistance);
    
    // High-resolution position updates with minimal smoothing
    setDynamicPosition(prev => {
      const current = new Vector3(...prev);
      current.lerp(newPosition, 0.25); // Higher resolution position updates
      return [current.x, current.y, current.z];
    });
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
  
  // Continuous size calculation
  const minSize = 3; // Tiny star size
  const maxSize = 240; // Full DreamNode size (doubled from 120)
  const currentSize = minSize + (scale * (maxSize - minSize));
  
  // Show DreamTalk symbol only when large enough
  const showSymbol = scale > 0.3; // Show symbol when more than 30% size
  const symbolOpacity = Math.min(1, Math.max(0, (scale - 0.3) / 0.7)); // Fade in from 30% to 100%
  
  // Show detailed label when very centered
  const showLabel = centeredness > 0.8;

  return (
    <Html
      position={dynamicPosition}
      center
      sprite
      style={{
        pointerEvents: scale > 0.1 ? 'auto' : 'none', // Only clickable when large enough
        userSelect: 'none'
      }}
    >
      <div
        style={{
          width: `${currentSize}px`,
          height: `${currentSize}px`,
          borderRadius: '50%',
          border: currentSize > 10 ? `${Math.max(1, currentSize * 0.04)}px solid ${borderColor}` : 'none',
          background: currentSize <= 10 ? '#FFFFFF' : '#000000', // White dot when tiny, black when large
          overflow: 'hidden',
          position: 'relative',
          cursor: scale > 0.3 ? 'pointer' : 'default',
          transition: 'all 0.1s ease',
          transform: isHovered && scale > 0.5 ? 'scale(1.1)' : 'scale(1)',
          boxShadow: currentSize <= 10 
            ? `0 0 ${currentSize * 2}px ${borderColor}, 0 0 ${currentSize * 4}px ${borderColor}` // Star glow
            : isHovered 
              ? `0 0 20px ${borderColor}` 
              : `0 0 10px rgba(${borderColor.slice(1)}, 0.5)` // Node glow
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* DreamTalk Media Container - only visible when large enough */}
        {showSymbol && dreamNode.dreamTalkMedia[0] && (
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
              background: 'rgba(0, 0, 0, 0.8)',
              opacity: symbolOpacity
            }}
          >
            <MediaRenderer media={dreamNode.dreamTalkMedia[0]} />
          </div>
        )}

        {/* Empty state text - only when large enough and no media */}
        {showSymbol && !dreamNode.dreamTalkMedia[0] && (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: `${Math.max(8, currentSize * 0.1)}px`,
              textAlign: 'center',
              padding: '8px',
              opacity: symbolOpacity
            }}
          >
            {dreamNode.name}
          </div>
        )}

        {/* Circular fade overlay */}
        {showSymbol && (
          <div
            style={{
              position: 'absolute',
              top: '10%',
              left: '10%',
              width: '80%',
              height: '80%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,1) 70%)',
              pointerEvents: 'none',
              opacity: symbolOpacity
            }}
          />
        )}

        {/* Detailed label - appears when very centered */}
        {showLabel && (
          <div
            style={{
              position: 'absolute',
              bottom: `-${currentSize * 0.25}px`,
              left: '50%',
              transform: 'translateX(-50%)',
              color: '#FFFFFF',
              fontSize: `${Math.max(10, currentSize * 0.12)}px`,
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