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
 * Word-wrap text to fit within a given max width
 * Handles spaces, hyphens, and very long words that need character-level breaks
 * Returns array of lines
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  // Split on spaces first, preserving hyphenated segments
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    // Check if adding this word would exceed maxWidth
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width <= maxWidth) {
      // Word fits, add it
      currentLine = testLine;
    } else if (currentLine) {
      // Word doesn't fit, start new line
      lines.push(currentLine);

      // Check if the word itself is too long (e.g., hyphenated words)
      if (ctx.measureText(word).width > maxWidth) {
        // Break on hyphens or force character breaks
        const brokenParts = breakLongWord(ctx, word, maxWidth);
        for (let i = 0; i < brokenParts.length - 1; i++) {
          lines.push(brokenParts[i]);
        }
        currentLine = brokenParts[brokenParts.length - 1];
      } else {
        currentLine = word;
      }
    } else {
      // First word is too long, need to break it
      const brokenParts = breakLongWord(ctx, word, maxWidth);
      for (let i = 0; i < brokenParts.length - 1; i++) {
        lines.push(brokenParts[i]);
      }
      currentLine = brokenParts[brokenParts.length - 1];
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

/**
 * Break a long word that doesn't fit within maxWidth
 * First tries to break on hyphens, then falls back to character breaks
 */
function breakLongWord(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const parts: string[] = [];

  // First, try breaking on hyphens
  if (word.includes('-')) {
    const segments = word.split('-');
    let currentPart = '';

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const separator = i < segments.length - 1 ? '-' : '';
      const testPart = currentPart ? `${currentPart}${segment}${separator}` : `${segment}${separator}`;

      if (ctx.measureText(testPart).width <= maxWidth) {
        currentPart = testPart;
      } else if (currentPart) {
        parts.push(currentPart);
        currentPart = `${segment}${separator}`;
      } else {
        // Single segment is too long, need character break
        const charParts = breakByCharacters(ctx, `${segment}${separator}`, maxWidth);
        for (let j = 0; j < charParts.length - 1; j++) {
          parts.push(charParts[j]);
        }
        currentPart = charParts[charParts.length - 1];
      }
    }
    if (currentPart) parts.push(currentPart);
    return parts;
  }

  // No hyphens, break by characters
  return breakByCharacters(ctx, word, maxWidth);
}

/**
 * Break text by characters when no other break points exist
 */
function breakByCharacters(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let currentPart = '';

  for (const char of text) {
    const testPart = currentPart + char;
    if (ctx.measureText(testPart).width <= maxWidth) {
      currentPart = testPart;
    } else {
      if (currentPart) parts.push(currentPart);
      currentPart = char;
    }
  }
  if (currentPart) parts.push(currentPart);

  return parts;
}

/**
 * Generate text-only overlay texture (no dark background)
 * Used for nodes without media - text is always visible
 */
function createTextOnlyTexture(name: string, size: number = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Clear with full transparency
  ctx.clearRect(0, 0, size, size);

  // Calculate content radius (inside border)
  const contentRadiusFraction = (0.5 - BORDER_WIDTH_FRACTION) / 0.5;
  const circleRadius = (size / 2) * contentRadiusFraction;

  // Use ~95% of circle diameter as max text width to match HTML version
  // HTML uses flexbox with padding:8px which allows text to use most of the width
  const maxWidth = circleRadius * 2 * 0.95;

  // Draw centered text (no background)
  // Match HTML version: Math.max(12, nodeSize * 0.08) scaled to canvas size
  // HTML nodeSize=240 → fontSize ~19px, canvas size=512 → scale factor ~2.13
  const fontSize = Math.max(26, size * 0.08);
  ctx.fillStyle = dreamNodeStyles.colors.text.primary;
  ctx.font = `${fontSize}px ${dreamNodeStyles.typography.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap for long names
  const lines = wrapText(ctx, name, maxWidth);

  // Draw lines centered
  const lineHeight = fontSize * 1.3;
  const totalHeight = (lines.length - 1) * lineHeight;
  const centerY = size / 2 + size * 0.02;
  const startY = centerY - totalHeight / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, size / 2, startY + i * lineHeight);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

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

  // Use ~95% of circle diameter as max text width to match HTML version
  const maxWidth = circleRadius * 2 * 0.95;

  // Draw centered text
  // Match HTML version: Math.max(12, nodeSize * 0.08) scaled to canvas size
  const fontSize = Math.max(26, size * 0.08);
  ctx.fillStyle = dreamNodeStyles.colors.text.primary;
  ctx.font = `${fontSize}px ${dreamNodeStyles.typography.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap for long names
  const lines = wrapText(ctx, name, maxWidth);

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

  // Check if node has media
  const hasMedia = texture !== null;

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

  // Create text-only texture for nodes without media (always visible)
  const textOnlyTexture = useMemo(() => {
    return createTextOnlyTexture(dreamNode.name, 512);
  }, [dreamNode.name]);

  // Create text-only material (always visible when no media)
  const textOnlyMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: textOnlyTexture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide
    });
  }, [textOnlyTexture]);

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

  // 9 pixel offset in world units (nodeSize / 80 * 2 is the size, so 1px = 2/80 = 0.025)
  const pixelOffset = 0.225;

  return (
    <group position={[0, pixelOffset, 0]}>
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

      {/* Text-only overlay for nodes without media (always visible) */}
      {!hasMedia && (
        <mesh
          position={[0, 0, 0.05]}
          geometry={geometry}
          material={textOnlyMaterial}
          renderOrder={2}
        />
      )}

      {/* Hover overlay sprite: dark circle + text (renders on top) */}
      {hoverOpacity > 0.01 && (
        <mesh
          position={[0, 0, 0.1]}
          geometry={geometry}
          material={hoverMaterial}
          renderOrder={3}
        />
      )}
    </group>
  );
};

export default DreamTalkSprite;
