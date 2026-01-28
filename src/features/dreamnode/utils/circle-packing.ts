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

  // Calculate ring configuration based on count
  const rings = calculateRingConfiguration(count);

  // Calculate circle radius based on the outermost ring
  const circleRadius = calculateCircleRadius(rings, parentRadius, padding);

  const positions: CirclePosition[] = [];

  let itemIndex = 0;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const countInRing = rings[ringIndex];
    const ringRadius = getRingRadius(ringIndex, rings.length, parentRadius, circleRadius);

    for (let i = 0; i < countInRing && itemIndex < count; i++) {
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
  if (count <= 20) {
    // Three rings: center, inner, outer
    const outer = Math.min(10, count - 6);
    return [Math.min(6, count - outer), outer];
  }

  // For many items: distribute across multiple rings
  // Outer rings can hold more items
  const rings: number[] = [];
  let remaining = count;
  let ringCapacity = 6;

  while (remaining > 0) {
    const inThisRing = Math.min(ringCapacity, remaining);
    rings.push(inThisRing);
    remaining -= inThisRing;
    ringCapacity = Math.min(ringCapacity + 4, 16); // Each outer ring can hold slightly more
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
