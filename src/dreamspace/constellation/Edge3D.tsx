/**
 * Edge3D Component - Individual Spherical Arc for DreamSong Relationships
 *
 * Renders a single relationship edge as a great circle arc between two DreamNodes
 * on the sphere surface. Uses the same interpolation algorithm as the HTML prototype.
 */

import React, { useMemo, useState } from 'react';
import { Vector3 } from 'three';
import { Line } from '@react-three/drei';

export interface Edge3DProps {
  /** Start position on sphere surface */
  sourcePosition: [number, number, number];

  /** End position on sphere surface */
  targetPosition: [number, number, number];

  /** Visual color of the edge */
  color?: string;

  /** Opacity (0-1) */
  opacity?: number;

  /** Whether this edge is currently hovered */
  isHovered?: boolean;

  /** Whether this edge is part of a selected thread */
  isSelected?: boolean;

  /** Click handler */
  onClick?: () => void;

  /** Hover handlers */
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

/**
 * Generate points for a great circle arc between two positions on a sphere
 * Uses the same algorithm as the HTML prototype: interpolation + normalization
 */
function generateArcPoints(
  source: [number, number, number],
  target: [number, number, number],
  steps: number = 20
): Vector3[] {
  const sourceVec = new Vector3(...source);
  const targetVec = new Vector3(...target);
  const points: Vector3[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Linear interpolation in 3D space, then normalize to project onto sphere
    const point = sourceVec.clone().lerp(targetVec, t).normalize();

    // Scale to sphere radius (matching DreamNode positions)
    point.multiplyScalar(5000);
    points.push(point);
  }

  return points;
}

export default function Edge3D({
  sourcePosition,
  targetPosition,
  color = '#666666',
  opacity = 0.6,
  isHovered = false,
  isSelected = false,
  onClick,
  onPointerEnter,
  onPointerLeave
}: Edge3DProps) {
  // Local hover state for internal management
  const [localHover, setLocalHover] = useState(false);

  // Calculate visual properties based on state
  const finalOpacity = useMemo(() => {
    let baseOpacity = opacity;

    if (isSelected) {
      baseOpacity = Math.min(1.0, baseOpacity + 0.3);
    }

    if (isHovered || localHover) {
      baseOpacity = Math.min(1.0, baseOpacity + 0.2);
    }

    return baseOpacity;
  }, [opacity, isSelected, isHovered, localHover]);

  const finalColor = useMemo(() => {
    if (isSelected) {
      return '#ffffff'; // White when selected
    }

    if (isHovered || localHover) {
      // Brighten the color on hover
      return color === '#666666' ? '#aaaaaa' : color;
    }

    return color;
  }, [color, isSelected, isHovered, localHover]);

  // Line width based on state
  const lineWidth = useMemo(() => {
    let width = 1;

    if (isSelected) {
      width = 3;
    } else if (isHovered || localHover) {
      width = 2;
    }

    return width;
  }, [isSelected, isHovered, localHover]);

  // Handle pointer events
  const handlePointerEnter = () => {
    setLocalHover(true);
    onPointerEnter?.();
  };

  const handlePointerLeave = () => {
    setLocalHover(false);
    onPointerLeave?.();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.();
  };

  return (
    <Line
      points={generateArcPoints(sourcePosition, targetPosition)}
      color={finalColor}
      lineWidth={lineWidth}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    />
  );
}

/**
 * Utility function to check if two positions are valid for edge creation
 */
export function isValidEdge(
  sourcePosition: [number, number, number],
  targetPosition: [number, number, number]
): boolean {
  const source = new Vector3(...sourcePosition);
  const target = new Vector3(...targetPosition);

  // Check if positions are not zero vectors
  if (source.length() < 1e-6 || target.length() < 1e-6) {
    return false;
  }

  // Check if positions are not identical
  const distance = source.distanceTo(target);
  return distance > 1e-6;
}

/**
 * Calculate the midpoint of an arc for positioning labels or other UI elements
 */
export function calculateArcMidpoint(
  sourcePosition: [number, number, number],
  targetPosition: [number, number, number]
): Vector3 {
  const source = new Vector3(...sourcePosition);
  const target = new Vector3(...targetPosition);

  // Midpoint of great circle arc
  const midpoint = source.clone().lerp(target, 0.5).normalize();
  midpoint.multiplyScalar(5000); // Scale to sphere radius

  return midpoint;
}