import React, { useState } from 'react';
import { Html } from '@react-three/drei';
import { DreamNode, MediaFile } from '../types/dreamnode';

interface DreamNode3DProps {
  dreamNode: DreamNode;
  onHover?: (node: DreamNode, isHovered: boolean) => void;
  onClick?: (node: DreamNode) => void;
  onDoubleClick?: (node: DreamNode) => void;
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
  onDoubleClick 
}: DreamNode3DProps) {
  const [isHovered, setIsHovered] = useState(false);

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
  
  // Constant size for foundational development
  const nodeSize = 240;
  const borderWidth = Math.max(1, nodeSize * 0.04); // ~10px border
  
  return (
    <Html
      position={dreamNode.position}
      center
      sprite
      style={{
        pointerEvents: 'auto',
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