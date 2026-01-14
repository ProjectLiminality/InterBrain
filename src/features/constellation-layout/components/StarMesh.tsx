/**
 * StarMesh Component
 *
 * WebGL-native star rendering for constellation background.
 * Replaces DOM-based Star3D for better performance.
 *
 * Uses a simple sprite with radial gradient texture for glow effect.
 */

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface StarMeshProps {
  position: [number, number, number];
  size?: number;
}

// Create a cached radial gradient texture for all stars
let starTexture: THREE.Texture | null = null;

function getStarTexture(): THREE.Texture {
  if (starTexture) return starTexture;

  // Create canvas for radial gradient
  const canvas = document.createElement('canvas');
  const size = 128; // Texture resolution
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;
  const center = size / 2;

  // Clear canvas to fully transparent
  ctx.clearRect(0, 0, size, size);

  // Create radial gradient matching STAR_GRADIENT from Star3D
  // Use full canvas size for gradient radius to cover corners
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.05, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.12, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(0.22, 'rgba(255, 255, 255, 0.25)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.1)');
  gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.03)');
  gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  // Draw circular gradient using arc instead of fillRect
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, center, 0, Math.PI * 2);
  ctx.fill();

  // Create THREE texture from canvas
  starTexture = new THREE.CanvasTexture(canvas);
  starTexture.needsUpdate = true;

  return starTexture;
}

/**
 * WebGL-native star component for night sky visualization
 *
 * Features:
 * - GPU-native rendering (no DOM overhead)
 * - Sprite-based always facing camera
 * - Shared texture across all stars
 * - Static positioning with offset toward camera
 */
export const StarMesh: React.FC<StarMeshProps> = ({ position, size = 7500 }) => {
  const spriteRef = useRef<THREE.Sprite>(null);

  // Calculate position with offset AWAY from camera (behind the node)
  // Negative offset pushes the star further from origin (camera)
  const STAR_OFFSET = -200; // Behind the DreamNode (larger offset to ensure visibility)

  const offsetPosition = useMemo(() => {
    const direction = [-position[0], -position[1], -position[2]];
    const length = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
    const normalized = [
      direction[0] / length,
      direction[1] / length,
      direction[2] / length
    ];

    return [
      position[0] + normalized[0] * STAR_OFFSET,
      position[1] + normalized[1] * STAR_OFFSET,
      position[2] + normalized[2] * STAR_OFFSET
    ] as [number, number, number];
  }, [position]);

  // Get shared star texture
  const texture = useMemo(() => getStarTexture(), []);

  // Scale factor to match the Html component's distanceFactor behavior
  // Html at distanceFactor=10 with 7500px div would be huge
  // We need a much smaller scale since sprites don't auto-scale
  const scale = size / 10; // Roughly match visual size

  return (
    <sprite
      ref={spriteRef}
      position={offsetPosition}
      scale={[scale, scale, 1]}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
};

export default StarMesh;
