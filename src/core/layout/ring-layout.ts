/**
 * Ring Layout Position Calculator
 *
 * Core algorithm for positioning DreamNodes in a honeycomb/ring pattern.
 * This is the fundamental display algorithm used by:
 * - Liminal-web mode (relationships around selected node)
 * - Search mode (search results)
 * - Edit mode (filtered search results)
 * - Copilot mode (conversation search results)
 *
 * The algorithm takes an ordered list and maps nodes to concentric hexagonal rings:
 * - Ring 1: Up to 6 nodes (closest/most prominent)
 * - Ring 2: Up to 12 nodes
 * - Ring 3: Up to 18 nodes
 * - Total: 36 active positions in honeycomb pattern
 */

/**
 * Configuration for ring layout positioning
 */
export interface RingLayoutConfig {
  /** Distance from camera for centered/focused node (appears largest) */
  centerDistance: number;

  /** Distances from camera for each ring (ring 1, 2, 3) */
  ringDistances: [number, number, number];

  /** Radii for each ring in world space */
  ringRadii: [number, number, number];

  /** Maximum nodes total across all rings (36 = 6+12+18) */
  maxActiveNodes: number;
}

// Raw ring layout values - direct control for easy iteration
const CENTER_DISTANCE = 50;

// Ring 1 (6 nodes)
const RING1_DISTANCE = 100;
const RING1_RADIUS = 40;

// Ring 2 (12 nodes)
const RING2_DISTANCE = 200;
const RING2_RADIUS = 125;

// Ring 3 (18 nodes)
const RING3_DISTANCE = 450;
const RING3_RADIUS = 335;

const RAW_DISTANCES: [number, number, number] = [RING1_DISTANCE, RING2_DISTANCE, RING3_DISTANCE];
const RAW_RADII: [number, number, number] = [RING1_RADIUS, RING2_RADIUS, RING3_RADIUS];

/**
 * Default configuration for ring layout positioning
 */
export const DEFAULT_RING_CONFIG: RingLayoutConfig = {
  centerDistance: CENTER_DISTANCE,
  ringDistances: RAW_DISTANCES,
  ringRadii: RAW_RADII,
  maxActiveNodes: 36  // 6 + 12 + 18 = 36 total
};

/**
 * Result of ring layout position calculation
 */
export interface RingLayoutPositions {
  /** Center node position (null for search mode / no center) */
  centerNode: {
    nodeId: string;
    position: [number, number, number];
  } | null;

  /** Ring 1 node positions (up to 6 nodes) */
  ring1Nodes: Array<{
    nodeId: string;
    position: [number, number, number];
  }>;

  /** Ring 2 node positions (up to 12 nodes) */
  ring2Nodes: Array<{
    nodeId: string;
    position: [number, number, number];
  }>;

  /** Ring 3 node positions (up to 18 nodes) */
  ring3Nodes: Array<{
    nodeId: string;
    position: [number, number, number];
  }>;

  /** Node IDs that aren't in rings (remain in constellation) */
  remainingNodeIds: string[];
}

/**
 * Calculate ring layout positions for an ordered list of nodes.
 *
 * This is the pure algorithm: ordered list → positions.
 * Features decide what goes in the ordered list (relationships, search results, etc.)
 *
 * @param orderedNodes - Nodes to position, ordered by priority (first = most prominent)
 * @param allNodeIds - All node IDs in the system (for calculating remainingNodeIds)
 * @param centerNodeId - Optional: if provided, this node gets center position
 * @param config - Layout configuration
 */
export function calculateRingPositions(
  orderedNodes: Array<{ id: string }>,
  allNodeIds: string[],
  centerNodeId?: string,
  config: RingLayoutConfig = DEFAULT_RING_CONFIG
): RingLayoutPositions {
  // Limit to max active nodes
  const limitedNodes = orderedNodes.slice(0, config.maxActiveNodes);
  const totalNodes = limitedNodes.length;

  // Generate positions
  const nodePositions = mapNodesToPositions(limitedNodes, totalNodes);

  // Separate into rings
  const { ring1Nodes, ring2Nodes, ring3Nodes } = separateIntoRings(nodePositions, totalNodes);

  // Calculate center position if requested
  const centerNode = centerNodeId ? {
    nodeId: centerNodeId,
    position: [0, 0, -config.centerDistance] as [number, number, number]
  } : null;

  // Calculate remaining nodes (not in rings or center)
  const activeNodeIds = new Set([
    ...(centerNodeId ? [centerNodeId] : []),
    ...limitedNodes.map(n => n.id)
  ]);
  const remainingNodeIds = allNodeIds.filter(id => !activeNodeIds.has(id));

  return {
    centerNode,
    ring1Nodes,
    ring2Nodes,
    ring3Nodes,
    remainingNodeIds
  };
}

/**
 * Map nodes to their 3D positions based on count
 */
function mapNodesToPositions(
  nodes: Array<{ id: string }>,
  totalNodes: number
): Array<{ nodeId: string; position: [number, number, number] }> {
  const nodePositions: Array<{ nodeId: string; position: [number, number, number] }> = [];

  if (totalNodes <= 6) {
    // For 1-6 nodes: Use direct equidistant angle calculation
    const ring1Count = totalNodes;

    let startAngle = -Math.PI / 2; // Default: start at top
    if (ring1Count === 6) {
      startAngle = -Math.PI / 2 + Math.PI / 6; // Rotate by 30° for flat edge at top
    }

    for (let i = 0; i < ring1Count; i++) {
      const angle = (i / ring1Count) * 2 * Math.PI + startAngle;
      const x = RAW_RADII[0] * Math.cos(angle);
      const y = RAW_RADII[0] * Math.sin(angle);
      nodePositions.push({
        nodeId: nodes[i].id,
        position: [x, -y, -RAW_DISTANCES[0]] // Negate Y for 3D coordinates
      });
    }
  } else {
    // For 7+ nodes: Use precise coordinate system with boolean masking
    const allPositions = generateAll42StaticPositions();
    const activeMask = getActiveMask(totalNodes);

    let nodeIndex = 0;
    for (let i = 0; i < 42 && nodeIndex < totalNodes; i++) {
      if (activeMask[i]) {
        nodePositions.push({
          nodeId: nodes[nodeIndex].id,
          position: allPositions[i]
        });
        nodeIndex++;
      }
    }
  }

  return nodePositions;
}

/**
 * Separate node positions into ring categories
 */
function separateIntoRings(
  nodePositions: Array<{ nodeId: string; position: [number, number, number] }>,
  totalNodes: number
): {
  ring1Nodes: Array<{ nodeId: string; position: [number, number, number] }>;
  ring2Nodes: Array<{ nodeId: string; position: [number, number, number] }>;
  ring3Nodes: Array<{ nodeId: string; position: [number, number, number] }>;
} {
  const ring1Nodes: Array<{ nodeId: string; position: [number, number, number] }> = [];
  const ring2Nodes: Array<{ nodeId: string; position: [number, number, number] }> = [];
  const ring3Nodes: Array<{ nodeId: string; position: [number, number, number] }> = [];

  if (totalNodes <= 6) {
    ring1Nodes.push(...nodePositions);
  } else {
    const activeMask = getActiveMask(totalNodes);

    for (let i = 0; i < nodePositions.length; i++) {
      const maskIndex = activeMask.findIndex((active, idx) => {
        if (!active) return false;
        const activeUpToHere = activeMask.slice(0, idx + 1).filter(Boolean).length;
        return activeUpToHere === i + 1;
      });

      if (maskIndex < 6) {
        ring1Nodes.push(nodePositions[i]);
      } else if (maskIndex < 18) {
        ring2Nodes.push(nodePositions[i]);
      } else {
        ring3Nodes.push(nodePositions[i]);
      }
    }
  }

  return { ring1Nodes, ring2Nodes, ring3Nodes };
}

/**
 * Generate all 42 static node positions using precise coordinate system
 */
function generateAll42StaticPositions(): [number, number, number][] {
  const allPositions: [number, number, number][] = [];

  // Ring 1: Nodes 1-6
  const ring1StartAngle = -Math.PI / 2 + Math.PI / 6;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 2 * Math.PI + ring1StartAngle;
    const x = RAW_RADII[0] * Math.cos(angle);
    const y = RAW_RADII[0] * Math.sin(angle);
    allPositions.push([x, -y, -RAW_DISTANCES[0]]);
  }

  // Ring 2: Nodes 7-18 (6 edge positions + 6 corner positions)
  const ring2EdgeRadius = RAW_RADII[1] * Math.cos(Math.PI / 6);

  // First 6 nodes: edge positions
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 2 * Math.PI - Math.PI / 2;
    const x = ring2EdgeRadius * Math.cos(angle);
    const y = ring2EdgeRadius * Math.sin(angle);
    allPositions.push([x, -y, -RAW_DISTANCES[1]]);
  }

  // Next 6 nodes: corner positions
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 2 * Math.PI - Math.PI / 2 + Math.PI / 6;
    const x = RAW_RADII[1] * Math.cos(angle);
    const y = RAW_RADII[1] * Math.sin(angle);
    allPositions.push([x, -y, -RAW_DISTANCES[1]]);
  }

  // Ring 3: Nodes 19-42
  const hexagonAngles = [30, 90, 150, 210, 270, 330];
  const baseRadius = RAW_RADII[2];
  const vertexPositions: [number, number][] = [];

  // Vertex positions (19-24)
  for (let i = 0; i < 6; i++) {
    const angleDegrees = hexagonAngles[i];
    const angleRadians = (angleDegrees - 90) * Math.PI / 180;
    const x = baseRadius * Math.cos(angleRadians);
    const y = baseRadius * Math.sin(angleRadians);
    vertexPositions.push([x, y]);
    allPositions.push([x, -y, -RAW_DISTANCES[2]]);
  }

  const lerpPath = (pointA: [number, number], pointB: [number, number], t: number): [number, number] => [
    pointA[0] + t * (pointB[0] - pointA[0]),
    pointA[1] + t * (pointB[1] - pointA[1])
  ];

  // Edge nodes (25-36: t = 1/3, 2/3)
  for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
    const startVertex = vertexPositions[edgeIndex];
    const endVertex = vertexPositions[(edgeIndex + 1) % 6];

    for (let nodeOnEdge = 0; nodeOnEdge < 2; nodeOnEdge++) {
      const t = (nodeOnEdge + 1) / 3;
      const [worldX, worldY] = lerpPath(startVertex, endVertex, t);
      allPositions.push([worldX, -worldY, -RAW_DISTANCES[2]]);
    }
  }

  // Additional edge midpoints (37-42: t = 0.5)
  for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
    const startVertex = vertexPositions[edgeIndex];
    const endVertex = vertexPositions[(edgeIndex + 1) % 6];
    const [worldX, worldY] = lerpPath(startVertex, endVertex, 0.5);
    allPositions.push([worldX, -worldY, -RAW_DISTANCES[2]]);
  }

  return allPositions;
}

/**
 * Generate boolean mask for active nodes based on total node count
 */
function getActiveMask(totalNodes: number): boolean[] {
  const mask = new Array(42).fill(false);

  // Ring 1: Equidistant placement for counts 1-6
  if (totalNodes >= 1) {
    const ring1Count = Math.min(totalNodes, 6);
    const equidistantIndices: number[] = [];

    if (ring1Count === 1) equidistantIndices.push(0);
    else if (ring1Count === 2) equidistantIndices.push(0, 3);
    else if (ring1Count === 3) equidistantIndices.push(0, 2, 4);
    else if (ring1Count === 4) equidistantIndices.push(0, 1, 3, 4);
    else if (ring1Count === 5) equidistantIndices.push(0, 1, 2, 3, 4);
    else if (ring1Count === 6) equidistantIndices.push(0, 1, 2, 3, 4, 5);

    equidistantIndices.forEach(index => { mask[index] = true; });
  }

  if (totalNodes <= 6) return mask;

  // Ring 2 and 3 patterns
  const activateRing2 = () => {
    for (let i = 6; i < 18; i++) mask[i] = true;
  };

  const activateRing3Nodes = (nodeNumbers: number[]) => {
    nodeNumbers.forEach(nodeNum => { mask[nodeNum - 1] = true; });
  };

  // Patterns for 7-36 nodes (preserved from original implementation)
  if (totalNodes === 7) {
    mask[6] = true;
  } else if (totalNodes === 8) {
    mask[6] = true; mask[9] = true;
  } else if (totalNodes === 9) {
    mask[6] = true; mask[8] = true; mask[10] = true;
  } else if (totalNodes === 10) {
    mask[11] = true; mask[7] = true; mask[8] = true; mask[10] = true;
  } else if (totalNodes === 11) {
    mask[6] = true; mask[7] = true; mask[8] = true; mask[10] = true; mask[11] = true;
  } else if (totalNodes === 12) {
    mask[6] = true; mask[7] = true; mask[8] = true; mask[9] = true; mask[10] = true; mask[11] = true;
  } else if (totalNodes === 13) {
    mask[6] = true; mask[7] = true; mask[8] = true; mask[14] = true; mask[15] = true; mask[10] = true; mask[11] = true;
  } else if (totalNodes === 14) {
    mask[17] = true; mask[12] = true; mask[7] = true; mask[8] = true; mask[14] = true; mask[15] = true; mask[10] = true; mask[11] = true;
  } else if (totalNodes === 15) {
    mask[17] = true; mask[12] = true; mask[7] = true; mask[8] = true; mask[14] = true; mask[15] = true; mask[10] = true; mask[11] = true; mask[6] = true;
  } else if (totalNodes === 16) {
    mask[17] = true; mask[12] = true; mask[7] = true; mask[8] = true; mask[14] = true; mask[15] = true; mask[10] = true; mask[11] = true; mask[6] = true; mask[9] = true;
  } else if (totalNodes === 17) {
    mask[17] = true; mask[12] = true; mask[7] = true; mask[8] = true; mask[14] = true; mask[15] = true; mask[10] = true; mask[11] = true; mask[6] = true; mask[16] = true; mask[13] = true;
  } else if (totalNodes === 18) {
    activateRing2();
  } else if (totalNodes === 19) {
    activateRing2(); activateRing3Nodes([42]);
  } else if (totalNodes === 20) {
    activateRing2(); activateRing3Nodes([42, 39]);
  } else if (totalNodes === 21) {
    activateRing2(); activateRing3Nodes([42, 38, 40]);
  } else if (totalNodes === 22) {
    activateRing2(); activateRing3Nodes([37, 38, 40, 41]);
  } else if (totalNodes === 23) {
    activateRing2(); activateRing3Nodes([37, 38, 40, 41, 42]);
  } else if (totalNodes === 24) {
    activateRing2(); activateRing3Nodes([37, 38, 39, 40, 41, 42]);
  } else if (totalNodes === 25) {
    activateRing2(); activateRing3Nodes([37, 38, 40, 41, 42, 29, 30]);
  } else if (totalNodes === 26) {
    activateRing2(); activateRing3Nodes([37, 38, 40, 41, 29, 30, 35, 36]);
  } else if (totalNodes >= 27 && totalNodes <= 36) {
    activateRing2();

    // Complex patterns for 27-36 nodes
    for (let i = 18; i < 42; i++) mask[i] = false;

    if (totalNodes === 27) {
      mask[36] = true; mask[40] = true; mask[34] = true; mask[35] = true;
      mask[38] = true; mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
    } else if (totalNodes === 28) {
      mask[36] = true; mask[40] = true; mask[34] = true; mask[35] = true;
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true; mask[28] = true;
    } else if (totalNodes === 29) {
      mask[34] = true; mask[35] = true; mask[26] = true; mask[27] = true;
      mask[30] = true; mask[31] = true;
    } else if (totalNodes === 30) {
      mask[34] = true; mask[35] = true; mask[26] = true; mask[27] = true;
      mask[30] = true; mask[31] = true; mask[32] = true; mask[33] = true; mask[24] = true;
    } else if (totalNodes === 31) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
    } else if (totalNodes === 32) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[41] = true; mask[18] = true; mask[20] = true; mask[38] = true; mask[21] = true;
    } else if (totalNodes === 33) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[34] = true; mask[35] = true;
    } else if (totalNodes === 34) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[18] = true; mask[20] = true; mask[21] = true;
      mask[34] = true; mask[35] = true; mask[29] = true; mask[28] = true;
    } else if (totalNodes === 35) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[18] = true; mask[20] = true; mask[21] = true;
      mask[34] = true; mask[35] = true; mask[38] = true; mask[22] = true; mask[19] = true;
    } else if (totalNodes === 36) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[18] = true; mask[29] = true; mask[28] = true;
    }
  }

  return mask;
}
