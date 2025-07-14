import React from 'react';
import { Html } from '@react-three/drei';
import { DreamNode } from '../types/dreamnode';

interface SimpleStarProps {
  dreamNode: DreamNode;
  onClick?: (node: DreamNode) => void;
}

/**
 * Lightweight star component for distant DreamNodes
 * No useFrame, no calculations - just a simple glowing dot
 */
export default function SimpleStar({ dreamNode, onClick }: SimpleStarProps) {
  const borderColor = dreamNode.type === 'dream' ? '#00a2ff' : '#FF644E';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(dreamNode);
  };

  return (
    <Html
      position={dreamNode.position} // Fixed sphere position
      center
      sprite
      style={{
        pointerEvents: 'auto',
        userSelect: 'none'
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
        onClick={handleClick}
      />
    </Html>
  );
}