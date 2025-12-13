import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';

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
export default function Star3D({ position, size = 7500 }: Star3DProps) {
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
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          // Pure CSS radial gradient - white center fading to transparent
          background: `radial-gradient(circle,
            rgba(255, 255, 255, 1) 0%,
            rgba(255, 255, 255, 0.8) 5%,
            rgba(255, 255, 255, 0.5) 12%,
            rgba(255, 255, 255, 0.25) 22%,
            rgba(255, 255, 255, 0.1) 35%,
            rgba(255, 255, 255, 0.03) 55%,
            rgba(255, 255, 255, 0) 80%
          )`,
        }}
      />
    </Html>
  );
}