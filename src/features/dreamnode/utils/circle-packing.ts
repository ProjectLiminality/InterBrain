/**
 * Circle Packing Utility
 *
 * Simple algorithm to pack equal-sized circles inside a parent circle.
 * Used for displaying submodules in the HolonView component.
 */

export interface CirclePosition {
  x: number;
  y: number;
  radius: number;
}

/**
 * Calculate optimal radius and positions for N equal-sized circles
 * packed inside a parent circle using ring distribution.
 *
 * Algorithm:
 * 1. For small counts (1-6): Place circles in a single ring around center
 * 2. For larger counts: Use multiple concentric rings
 * 3. Each circle is positioned at equal angular intervals in its ring
 *
 * @param count Number of circles to pack
 * @param parentRadius Radius of the parent circle
 * @param padding Optional padding between circles (default: 0.1 = 10% of circle radius)
 * @returns Array of circle positions (x, y relative to center, and radius)
 */
export function packCirclesInParent(
  count: number,
  parentRadius: number,
  padding: number = 0.1
): CirclePosition[] {
  if (count <= 0) return [];

  // Special case: single circle in center
  if (count === 1) {
    const radius = parentRadius * 0.5;
    return [{ x: 0, y: 0, radius }];
  }

  // Special case: 2 circles — place side by side, tighter gap
  if (count === 2) {
    const radius = parentRadius * 0.38;
    const gap = radius * 0.15;
    return [
      { x: -(radius + gap / 2), y: 0, radius },
      { x:  (radius + gap / 2), y: 0, radius },
    ];
  }

  // For 3-4: all in a single ring, no center occupant
  // For 5+: first circle at center, remaining N-1 in rings
  const hasCenter = count >= 5;
  const ringCount = hasCenter ? count - 1 : count;

  // Calculate ring configuration for the surrounding items
  const rings = calculateRingConfiguration(ringCount);

  // Calculate circle radius accounting for center occupant
  const circleRadius = hasCenter
    ? calculateCircleRadiusWithCenter(rings, parentRadius, padding)
    : calculateCircleRadius(rings, parentRadius, padding);

  const positions: CirclePosition[] = [];

  // Place center circle first
  if (hasCenter) {
    positions.push({ x: 0, y: 0, radius: circleRadius });
  }

  // Place ring circles
  let itemIndex = 0;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const countInRing = rings[ringIndex];
    const ringRadius = hasCenter
      ? getRingRadiusWithCenter(ringIndex, rings.length, parentRadius, circleRadius)
      : getRingRadius(ringIndex, rings.length, parentRadius, circleRadius);

    for (let i = 0; i < countInRing && itemIndex < ringCount; i++) {
      const angle = (2 * Math.PI * i) / countInRing - Math.PI / 2; // Start from top
      const x = ringRadius * Math.cos(angle);
      const y = ringRadius * Math.sin(angle);

      positions.push({ x, y, radius: circleRadius });
      itemIndex++;
    }
  }

  return positions;
}

/**
 * Determine how many circles to place in each ring
 */
function calculateRingConfiguration(count: number): number[] {
  if (count <= 1) return [1];
  if (count <= 6) return [count]; // Single ring
  if (count <= 12) return [6, count - 6]; // Inner 6, outer rest

  // For 13+: distribute across rings.
  // Inner rings hold fewer, outer rings hold more.
  const rings: number[] = [];
  let remaining = count;
  let ringCapacity = 6;

  while (remaining > 0) {
    const inThisRing = Math.min(ringCapacity, remaining);
    rings.push(inThisRing);
    remaining -= inThisRing;
    ringCapacity = Math.min(ringCapacity + 4, 16);
  }

  return rings;
}

/**
 * Calculate the radius for each child circle based on configuration
 */
function calculateCircleRadius(
  rings: number[],
  parentRadius: number,
  padding: number
): number {
  const numRings = rings.length;
  const maxInRing = Math.max(...rings);

  // Calculate based on the circumference needed for the most populated ring
  // and the depth needed for all rings
  const depthRadius = parentRadius / (numRings + 1.5);
  const circumRadius = (2 * Math.PI * parentRadius * 0.8) / (maxInRing * (1 + padding) * 2 * numRings);

  return Math.min(depthRadius, circumRadius) * (1 - padding);
}

/**
 * Get the distance from center for a given ring
 */
function getRingRadius(
  ringIndex: number,
  totalRings: number,
  parentRadius: number,
  circleRadius: number
): number {
  if (totalRings === 1) {
    // Single ring - position at distance that keeps circles inside parent
    return parentRadius - circleRadius * 1.5;
  }

  // Multiple rings - distribute from center outward
  const maxRadius = parentRadius - circleRadius * 1.3;
  const minRadius = circleRadius * 1.5;
  const step = (maxRadius - minRadius) / Math.max(1, totalRings - 1);

  return minRadius + step * ringIndex;
}

/**
 * Calculate circle radius when a center circle is present.
 *
 * Layout: center(0) — ring0 — ring1 — ... — edge
 * Equal step between each. Step determined by depth constraint,
 * then capped by circumference of the innermost ring (most cramped).
 */
function calculateCircleRadiusWithCenter(
  rings: number[],
  parentRadius: number,
  padding: number
): number {
  const numRings = rings.length;
  // Step from center to ring0, ring0 to ring1, ..., last ring to edge.
  // That's numRings + 1 intervals (center→ring0, ..., ringN→edge).
  // We want the outermost ring to sit at parentRadius - r, so:
  //   step * numRings + r = parentRadius  (ring centers + one radius to edge)
  //   step = (parentRadius - r) / numRings
  // And r ≈ step/2 (circle radius is half the inter-ring gap).
  // Solving: step = parentRadius / (numRings + 0.5)
  //          r = step / 2
  const step = parentRadius / (numRings + 0.5);
  let r = step * 0.5 * (1 - padding);

  // Circumference cap: circles on the innermost ring must not overlap.
  // Ring 0 sits at distance = step from center.
  // Its circumference = 2π * step. Must fit rings[0] circles of diameter 2r.
  const innerCircum = 2 * Math.PI * step;
  const maxByCircum = (innerCircum / rings[0]) * 0.5 * (1 - padding);
  r = Math.min(r, maxByCircum);

  return r;
}

/**
 * Get ring radius when a center circle is present.
 * Equal spacing: ring k sits at (k+1) * step from center.
 */
function getRingRadiusWithCenter(
  ringIndex: number,
  totalRings: number,
  parentRadius: number,
  _circleRadius: number
): number {
  const step = parentRadius / (totalRings + 0.5);
  return step * (ringIndex + 1);
}

/**
 * Get grid layout positions for small numbers of items
 * Alternative to circle packing for 2-4 items
 */
export function getGridPositions(
  count: number,
  containerSize: number,
  itemSize: number
): { x: number; y: number }[] {
  const padding = itemSize * 0.2;
  const effectiveSize = itemSize + padding;

  switch (count) {
    case 1:
      return [{ x: 0, y: 0 }];
    case 2:
      return [
        { x: -effectiveSize / 2, y: 0 },
        { x: effectiveSize / 2, y: 0 }
      ];
    case 3:
      return [
        { x: 0, y: -effectiveSize / 2 },
        { x: -effectiveSize / 2, y: effectiveSize / 2 },
        { x: effectiveSize / 2, y: effectiveSize / 2 }
      ];
    case 4:
      return [
        { x: -effectiveSize / 2, y: -effectiveSize / 2 },
        { x: effectiveSize / 2, y: -effectiveSize / 2 },
        { x: -effectiveSize / 2, y: effectiveSize / 2 },
        { x: effectiveSize / 2, y: effectiveSize / 2 }
      ];
    default:
      // Fall back to circle packing for 5+ items
      return packCirclesInParent(count, containerSize / 2).map(p => ({
        x: p.x,
        y: p.y
      }));
  }
}
