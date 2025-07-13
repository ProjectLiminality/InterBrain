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

  // Calculate visual state based on distance from camera
  useFrame(() => {
    const nodePosition = new Vector3(...dreamNode.position);
    const distance = camera.position.distanceTo(nodePosition);
    
    // LOD thresholds
    const starThreshold = 2000;
    const detailedThreshold = 500;
    
    // Calculate scale based on distance (Gaussian drop-off from prototype)
    const maxDistance = Math.sqrt(size.width * size.width + size.height * size.height) / 2;
    const screenPosition = nodePosition.clone().project(camera);
    const distanceFromCenter = Math.sqrt(
      Math.pow((screenPosition.x * size.width / 2), 2) + 
      Math.pow((screenPosition.y * size.height / 2), 2)
    );
    const normalizedDistance = distanceFromCenter / maxDistance;
    const scale = Math.max(0.25, 2 * (1 - Math.min(1, normalizedDistance * 2)));

    // Determine LOD level
    let lod: VisualState['lod'] = 'node';
    if (distance > starThreshold) {
      lod = 'star';
    } else if (distance < detailedThreshold) {
      lod = 'detailed';
    }

    setVisualState(prev => ({
      ...prev,
      lod,
      scale,
      distanceFromCamera: distance,
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
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: borderColor,
            border: `1px solid ${borderColor}`,
            boxShadow: `0 0 10px ${borderColor}`,
            cursor: 'pointer',
            transition: 'all 0.2s ease'
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