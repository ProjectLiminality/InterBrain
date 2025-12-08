import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import starImage from './assets/star.png';

interface Star3DProps {
  position: [number, number, number];
  size?: number;
}

/**
 * Pure visual star component for night sky visualization
 * 
 * Features:
 * - No interactions (purely visual)
 * - Static positioning with offset toward camera
 * - Consistent sizing and appearance
 * - Used to occlude distant DreamNodes
 */
export default function Star3D({ position, size = 5000 }: Star3DProps) {
  // Calculate position with small offset toward camera (origin)
  // This places the star slightly closer than the DreamNode at the same anchor
  const STAR_OFFSET = 50; // Units closer to camera than anchor position
  
  const offsetPosition = useMemo(() => {
    // Calculate normalized direction toward origin (camera)
    const direction = [-position[0], -position[1], -position[2]];
    const length = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
    const normalized = [
      direction[0] / length,
      direction[1] / length,
      direction[2] / length
    ];
    
    // Apply offset toward camera
    return [
      position[0] + normalized[0] * STAR_OFFSET,
      position[1] + normalized[1] * STAR_OFFSET,
      position[2] + normalized[2] * STAR_OFFSET
    ] as [number, number, number];
  }, [position]);
  
  return (
    <Html
      position={offsetPosition}
      transform
      sprite // Always face camera
      style={{
        pointerEvents: 'none', // No interactions - pure visual
        userSelect: 'none',
        overflow: 'visible', // Allow content to extend beyond container
        maxWidth: 'none', // Remove any max-width constraints
        maxHeight: 'none', // Remove any max-height constraints
        width: `${size}px`, // Let content determine size
        height: `${size}px` // Let content determine size
      }}
    >
      <img
        src={starImage}
        alt=""
        style={{
          width: `${size}px`,
          height: `${size}px`,
          opacity: 1,
          filter: 'brightness(1)',
          objectFit: 'fill', // Changed from 'contain' to 'fill' to use full container
          // No hover effects or transitions - pure static visual
        }}
        draggable={false}
      />
    </Html>
  );
}