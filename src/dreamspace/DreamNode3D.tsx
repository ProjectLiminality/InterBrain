import React, { useState } from 'react';
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
 * 3D DreamNode component using pure HTML approach
 * 
 * Features:
 * - Billboard effect (always faces camera)
 * - LOD system with star/node/detailed levels
 * - Circular HTML design with DreamTalk media
 * - Color-coded borders (blue for Dreams, red for Dreamers)
 * - Clean intersection detection via HTML events
 */
export default function DreamNode3D({ 
  dreamNode, 
  onHover, 
  onClick, 
  onDoubleClick 
}: DreamNode3DProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [visualState, setVisualState] = useState<VisualState>({
    lod: 'node',
    scale: 1,
    billboard: true,
    distanceFromCamera: 1000,
    isHovered: false,
    isSelected: false
  });

  const { camera, size } = useThree();

  // Throttled frame update for performance
  let frameCount = 0;
  const updateFrequency = 3; // Update every 3rd frame
  
  useFrame(() => {
    frameCount++;
    if (frameCount % updateFrequency !== 0) return;
    
    const nodePosition = new Vector3(...dreamNode.position);
    const distance = camera.position.distanceTo(nodePosition);
    
    // Project to screen space to get actual visual size
    const screenPosition = nodePosition.clone().project(camera);
    
    // Convert from normalized device coordinates to screen pixels
    const screenX = (screenPosition.x * 0.5 + 0.5) * size.width;
    const screenY = (-screenPosition.y * 0.5 + 0.5) * size.height;
    
    // Calculate distance from screen center in pixels
    const centerX = size.width / 2;
    const centerY = size.height / 2;
    const pixelDistanceFromCenter = Math.sqrt(
      Math.pow(screenX - centerX, 2) + 
      Math.pow(screenY - centerY, 2)
    );
    
    // More aggressive scaling - exponential drop-off
    const maxPixelDistance = Math.sqrt(centerX * centerX + centerY * centerY);
    const normalizedDistance = pixelDistanceFromCenter / maxPixelDistance;
    
    // Exponential scaling for more dramatic size changes
    const scale = Math.max(0.1, Math.pow(1 - normalizedDistance, 2) * 3);
    
    // LOD based on visual scale, not distance
    let lod: VisualState['lod'] = 'node';
    if (scale < 0.2) {
      lod = 'star';
    } else if (scale > 1.5 && distance < 500) {
      lod = 'detailed';
    }

    setVisualState(prev => {
      // Only update if values have changed significantly
      if (
        Math.abs(prev.scale - scale) > 0.05 ||
        prev.lod !== lod ||
        prev.isHovered !== isHovered
      ) {
        return {
          ...prev,
          lod,
          scale,
          distanceFromCamera: distance,
          isHovered
        };
      }
      return prev;
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
  
  // Base size for the node (will be scaled by visual state)
  const baseSize = 120;
  const currentSize = baseSize * visualState.scale;

  // Star rendering for distant nodes
  if (visualState.lod === 'star') {
    return (
      <Html
        position={dreamNode.position}
        center
        sprite // Billboard effect
        style={{
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
      >
        <div
          style={{
            width: '4px',
            height: '4px',
            borderRadius: '50%',
            background: '#FFFFFF',
            boxShadow: `
              0 0 8px ${borderColor},
              0 0 16px ${borderColor},
              0 0 24px ${borderColor},
              0 0 32px ${borderColor}
            `,
            cursor: 'pointer',
            opacity: 0.9,
            transition: 'all 0.1s ease'
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
        />
      </Html>
    );
  }

  // Full node rendering
  const currentMedia = dreamNode.dreamTalkMedia[0]; // For now, show first media file

  return (
    <Html
      position={dreamNode.position}
      center
      sprite // Billboard effect
      style={{
        pointerEvents: 'auto',
        userSelect: 'none'
      }}
    >
      <div
        className="dreamnode-container"
        style={{
          width: `${currentSize}px`,
          height: `${currentSize}px`,
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
          {currentMedia ? (
            <MediaRenderer media={currentMedia} />
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

        {/* Circular fade overlay (from prototype pattern) */}
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

        {/* Node name label (appears on hover for detailed view) */}
        {isHovered && visualState.lod === 'detailed' && (
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
  );
}

/**
 * Renders different types of media in the DreamTalk circle
 * Based on prototype media rendering patterns
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
            filter: 'invert(1)' // Make controls white
          }}
        />
      </div>
    );
  }

  // Fallback for unknown media types
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