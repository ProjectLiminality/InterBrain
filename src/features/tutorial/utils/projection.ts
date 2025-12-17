/**
 * Projection Utilities for Tutorial Elements
 *
 * These utilities help place 2D/3D elements (dots, text, etc.) so they appear
 * visually aligned with 3D objects from the camera's perspective.
 */

/**
 * Project a 3D point onto a plane at a given Z depth along the camera ray.
 * Camera is assumed to be at origin (0,0,0), so the ray goes from origin through the point.
 *
 * Uses similar triangles: at targetZ, the X,Y coordinates scale proportionally.
 *
 * Example: A node at [10, 5, -100] projected to Z=-30 becomes [3, 1.5, -30]
 * because scale = -30/-100 = 0.3
 *
 * @param point - The 3D point to project [x, y, z]
 * @param targetZ - The Z plane to project onto (e.g., -30)
 * @returns The projected point [x', y', targetZ]
 */
export function projectToZPlane(
  point: [number, number, number],
  targetZ: number
): [number, number, number] {
  const [x, y, z] = point;

  // Edge case: if point is at targetZ already, return as-is
  if (Math.abs(z - targetZ) < 0.001) {
    return [x, y, targetZ];
  }

  // Edge case: point at camera (z=0) - can't project
  if (Math.abs(z) < 0.001) {
    return [x, y, targetZ];
  }

  // Similar triangles: x'/x = y'/y = targetZ/z
  const scale = targetZ / z;
  return [x * scale, y * scale, targetZ];
}

/**
 * Project a 3D point onto a plane, with an optional offset from the projected position.
 * Useful for placing text labels near nodes but slightly offset.
 *
 * @param point - The 3D point to project [x, y, z]
 * @param targetZ - The Z plane to project onto
 * @param offset - Offset to add after projection [dx, dy, dz]
 * @returns The projected and offset point
 */
export function projectToZPlaneWithOffset(
  point: [number, number, number],
  targetZ: number,
  offset: [number, number, number]
): [number, number, number] {
  const projected = projectToZPlane(point, targetZ);
  return [
    projected[0] + offset[0],
    projected[1] + offset[1],
    projected[2] + offset[2],
  ];
}

/**
 * Calculate the midpoint between two projected positions.
 * Useful for placing text labels between two nodes.
 *
 * @param pointA - First 3D point
 * @param pointB - Second 3D point
 * @param targetZ - The Z plane to project onto
 * @returns The midpoint of the two projected positions
 */
export function projectMidpointToZPlane(
  pointA: [number, number, number],
  pointB: [number, number, number],
  targetZ: number
): [number, number, number] {
  const projA = projectToZPlane(pointA, targetZ);
  const projB = projectToZPlane(pointB, targetZ);
  return [
    (projA[0] + projB[0]) / 2,
    (projA[1] + projB[1]) / 2,
    targetZ,
  ];
}

// Hit sphere radius from DreamNode3D (sphereGeometry args={[12, 8, 8]})
const HIT_SPHERE_RADIUS = 12;

/**
 * Calculate edge positions for golden dot travel between two nodes.
 *
 * Instead of starting at node centers, the dot starts at the edge of the
 * start node's hit sphere (pointing toward the destination) and ends at
 * the edge of the end node's hit sphere (coming from the source).
 *
 * This ensures:
 * 1. The slow easing animation happens outside the node's visual footprint
 * 2. The dot appears to "launch from" and "land on" nodes naturally
 * 3. Hit detection still works (positions are slightly inside the boundary)
 *
 * @param fromNodePos - 3D position of the starting node
 * @param toNodePos - 3D position of the ending node
 * @param insetFactor - How far inside the hit sphere to place the point (0-1, default 0.9 = just inside edge)
 * @returns Object with from and to edge positions
 */
export function calculateEdgePositions(
  fromNodePos: [number, number, number],
  toNodePos: [number, number, number],
  insetFactor: number = 0.9
): {
  from: [number, number, number];
  to: [number, number, number];
} {
  // Calculate direction vector from start to end
  const dx = toNodePos[0] - fromNodePos[0];
  const dy = toNodePos[1] - fromNodePos[1];
  const dz = toNodePos[2] - fromNodePos[2];

  // Normalize the direction
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length < 0.001) {
    // Nodes are at same position, return as-is
    return { from: fromNodePos, to: toNodePos };
  }

  const nx = dx / length;
  const ny = dy / length;
  const nz = dz / length;

  // Calculate edge offset (slightly inside the hit sphere boundary)
  const edgeOffset = HIT_SPHERE_RADIUS * insetFactor;

  // Start position: from node center + direction * offset (toward destination)
  const from: [number, number, number] = [
    fromNodePos[0] + nx * edgeOffset,
    fromNodePos[1] + ny * edgeOffset,
    fromNodePos[2] + nz * edgeOffset,
  ];

  // End position: to node center - direction * offset (coming from source)
  const to: [number, number, number] = [
    toNodePos[0] - nx * edgeOffset,
    toNodePos[1] - ny * edgeOffset,
    toNodePos[2] - nz * edgeOffset,
  ];

  return { from, to };
}

/**
 * Combined utility: Calculate edge positions and project to Z plane.
 *
 * This is the main function to use for golden dot animations - it handles
 * both the edge offset calculation AND the perspective projection in one call.
 *
 * @param fromNodePos - 3D position of the starting node
 * @param toNodePos - 3D position of the ending node
 * @param targetZ - The Z plane to project onto (e.g., -30)
 * @param insetFactor - How far inside the hit sphere (default 0.9)
 * @returns Object with projected from and to positions at node edges
 */
export function calculateProjectedEdgePositions(
  fromNodePos: [number, number, number],
  toNodePos: [number, number, number],
  targetZ: number,
  insetFactor: number = 0.9
): {
  from: [number, number, number];
  to: [number, number, number];
} {
  // First calculate edge positions in 3D space
  const edgePositions = calculateEdgePositions(fromNodePos, toNodePos, insetFactor);

  // Then project both to the target Z plane
  return {
    from: projectToZPlane(edgePositions.from, targetZ),
    to: projectToZPlane(edgePositions.to, targetZ),
  };
}

/**
 * Calculate position for text label next to a node.
 *
 * Projects the node position to the target Z plane and applies an offset
 * to position the text beside (not on top of) the node.
 *
 * @param nodePos - 3D position of the node
 * @param targetZ - The Z plane to project onto (e.g., -30)
 * @param offsetDirection - Direction to offset: 'right', 'left', 'above', 'below'
 * @param offsetAmount - Distance to offset from projected node center
 * @returns Position for the text label
 */
export function calculateTextPositionNextToNode(
  nodePos: [number, number, number],
  targetZ: number,
  offsetDirection: 'right' | 'left' | 'above' | 'below' = 'right',
  offsetAmount: number = 15
): [number, number, number] {
  // Project node position to target Z plane
  const projected = projectToZPlane(nodePos, targetZ);

  // Apply offset based on direction
  switch (offsetDirection) {
    case 'right':
      return [projected[0] + offsetAmount, projected[1], projected[2]];
    case 'left':
      return [projected[0] - offsetAmount, projected[1], projected[2]];
    case 'above':
      return [projected[0], projected[1] + offsetAmount, projected[2]];
    case 'below':
      return [projected[0], projected[1] - offsetAmount, projected[2]];
  }
}
