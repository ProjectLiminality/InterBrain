/**
 * DreamTalkSprite - WebGL sprite-based DreamTalk rendering
 *
 * Two-sprite architecture:
 * 1. Content sprite: Texture + border + fade gradient (this shader)
 * 2. Hover overlay: Semi-transparent black + text (separate, opacity animated)
 */

import React, { useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { DreamNode } from '../types/dreamnode';
import { useContentTexture } from '../hooks/useContentTexture';
import {
  createCircularClipMaterial,
  updateCircularClipTexture
} from '../shaders/circularClipShader';
import { dreamNodeStyles } from '../styles/dreamNodeStyles';

interface DreamTalkSpriteProps {
  dreamNode: DreamNode;
  isHovered: boolean;
  isPendingRelationship: boolean;
  isTutorialHighlighted: boolean;
  glowIntensity: number;
  nodeSize: number;
  borderWidth: number;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onClick?: (e: THREE.Event) => void;
  onDoubleClick?: (e: THREE.Event) => void;
}

// Border width as fraction of radius (must match shader)
const BORDER_WIDTH_FRACTION = 0.026;

/**
 * Generate hover overlay texture: semi-transparent black circle with centered text
 * Sized to fit inside the border (content area only)
 */
function createHoverOverlayTexture(name: string, size: number = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Clear with full transparency
  ctx.clearRect(0, 0, size, size);

  // Calculate radius to stop at border edge
  // Border starts at (0.5 - borderWidth) in UV space
  const contentRadiusFraction = (0.5 - BORDER_WIDTH_FRACTION) / 0.5;
  const circleRadius = (size / 2) * contentRadiusFraction;

  // Draw semi-transparent black circle (content area only)
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, circleRadius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fill();

  // Draw centered text
  const fontSize = Math.max(28, size * 0.09);
  ctx.fillStyle = dreamNodeStyles.colors.text.primary;
  ctx.font = `${fontSize}px ${dreamNodeStyles.typography.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap for long names
  const maxWidth = circleRadius * 1.5;
  const words = name.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Draw lines centered vertically and horizontally
  // Offset slightly lower for visual balance
  const lineHeight = fontSize * 1.3;
  const totalHeight = (lines.length - 1) * lineHeight; // Space between lines only
  const centerY = size / 2 + size * 0.02; // 2% lower
  const startY = centerY - totalHeight / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, size / 2, startY + i * lineHeight);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export const DreamTalkSprite: React.FC<DreamTalkSpriteProps> = ({
  dreamNode,
  isHovered,
  isPendingRelationship,
  isTutorialHighlighted,
  nodeSize,
  onPointerEnter,
  onPointerLeave,
  onClick,
  onDoubleClick
}) => {
  // Load texture directly from disk using Obsidian's getResourcePath
  const { texture } = useContentTexture(dreamNode);

  // Effective hover state (includes pending relationship and tutorial highlight)
  const effectiveHover = isHovered || isPendingRelationship || isTutorialHighlighted;

  // Animated opacity for hover overlay
  const [hoverOpacity, setHoverOpacity] = useState(0);

  // Size calculation
  const size = (nodeSize / 80) * 2;

  // Create geometry - simple plane (shared between both sprites)
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(size, size);
  }, [size]);

  // Create content material with border and gradient
  const contentMaterial = useMemo(() => {
    return createCircularClipMaterial(texture, dreamNode.type);
  }, [dreamNode.type]);

  // Update content texture when it loads
  useEffect(() => {
    updateCircularClipTexture(contentMaterial, texture);
  }, [texture, contentMaterial]);

  // Create hover overlay texture (cached per node name)
  const hoverTexture = useMemo(() => {
    return createHoverOverlayTexture(dreamNode.name, 512);
  }, [dreamNode.name]);

  // Create hover overlay material
  const hoverMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: hoverTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,  // Don't test against depth buffer - always render on top
      side: THREE.DoubleSide
    });
  }, [hoverTexture]);

  // Animate hover opacity
  useFrame((_, delta) => {
    const targetOpacity = effectiveHover ? 1 : 0;
    const lerpSpeed = 16; // Snappy fade
    const newOpacity = THREE.MathUtils.lerp(hoverOpacity, targetOpacity, Math.min(1, delta * lerpSpeed));

    if (Math.abs(newOpacity - hoverOpacity) > 0.001) {
      setHoverOpacity(newOpacity);
      hoverMaterial.opacity = newOpacity;
      hoverMaterial.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Content sprite: texture + border + gradient */}
      <mesh
        position={[0, 0, 0]}
        geometry={geometry}
        material={contentMaterial}
        renderOrder={1}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />

      {/* Hover overlay sprite: dark circle (renders on top of content) */}
      {hoverOpacity > 0.01 && (
        <mesh
          position={[0, 0, 0.1]}
          geometry={geometry}
          material={hoverMaterial}
          renderOrder={2}
        />
      )}
    </group>
  );
};

export default DreamTalkSprite;
