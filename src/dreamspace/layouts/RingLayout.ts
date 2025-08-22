/**
 * Ring Layout Position Calculator
 * 
 * Unified positioning algorithms for both liminal web and semantic search layouts.
 * Implements center + hexagonal ring pattern with scalable distribution up to 36 nodes.
 */

import { RelationshipGraph } from '../../utils/relationship-graph';
import { useInterBrainStore } from '../../store/interbrain-store';

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
  
  /** Distance from camera for outer circle nodes (second-degree, hidden buffer) */
  outerCircleDistance: number;
  
  /** Radius of outer circle for second-degree nodes */
  outerCircleRadius: number;
  
  /** Maximum nodes to preload in outer circle (buffer limit) */
  maxOuterConnections: number;
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

// Direct arrays - no calculations, just raw values
const RAW_DISTANCES: [number, number, number] = [RING1_DISTANCE, RING2_DISTANCE, RING3_DISTANCE];
const RAW_RADII: [number, number, number] = [RING1_RADIUS, RING2_RADIUS, RING3_RADIUS];

// Log the values for reference during development
console.log('Ring Layout: Raw distances:', RAW_DISTANCES);
console.log('Ring Layout: Raw radii:', RAW_RADII);

/**
 * Default configuration for ring layout positioning
 */
export const DEFAULT_RING_CONFIG: RingLayoutConfig = {
  centerDistance: CENTER_DISTANCE,         // Center node distance
  ringDistances: RAW_DISTANCES,           // Ring distances - direct values
  ringRadii: RAW_RADII,                   // Ring radii - direct values  
  maxActiveNodes: 36,                      // 6 + 12 + 18 = 36 total
  outerCircleDistance: 600,                // Far distance = hidden buffer
  outerCircleRadius: 600,                  // Large radius for outer buffer
  maxOuterConnections: 50                  // Preload buffer for smooth transitions
};

/**
 * Result of ring layout position calculation
 */
export interface RingLayoutPositions {
  /** Center node position (empty for search mode) */
  centerNode: {
    nodeId: string;
    position: [number, number, number];
  } | null;
  
  /** Ring 1 node positions (6 nodes) */
  ring1Nodes: Array<{
    nodeId: string;
    position: [number, number, number];
  }>;
  
  /** Ring 2 node positions (12 nodes) */
  ring2Nodes: Array<{
    nodeId: string;
    position: [number, number, number];
  }>;
  
  /** Ring 3 node positions (18 nodes) */
  ring3Nodes: Array<{
    nodeId: string;
    position: [number, number, number];
  }>;
  
  /** Nodes that remain on the sphere in constellation mode */
  sphereNodes: string[];
}

/**
 * Calculate ring layout positions for a given center node or ordered node list
 * Uses precise 42-node coordinate system with boolean masking
 */
export function calculateRingLayoutPositions(
  focusedNodeId: string | null,
  relationshipGraph: RelationshipGraph,
  config: RingLayoutConfig = DEFAULT_RING_CONFIG
): RingLayoutPositions {
  let orderedNodes: Array<{ id: string; name?: string; type?: string }>;
  
  if (focusedNodeId) {
    // Liminal web mode: get relationships for focused node
    const focusedNode = relationshipGraph.nodes.get(focusedNodeId);
    if (!focusedNode) {
      throw new Error(`Focused node ${focusedNodeId} not found in relationship graph`);
    }
    
    // Get first-degree connections (Dreams ↔ Dreamers only)
    orderedNodes = relationshipGraph.getOppositeTypeConnections(focusedNodeId);
  } else {
    // Search mode: would get ordered search results here
    // For now, return empty layout (will be implemented in search integration)
    orderedNodes = [];
  }
  
  // Limit to max active nodes (36 = 6+12+18)
  const limitedNodes = orderedNodes.slice(0, config.maxActiveNodes);
  const totalNodes = limitedNodes.length;
  
  // Map nodes to their positions
  const nodePositions: Array<{ nodeId: string; position: [number, number, number] }> = [];
  
  if (totalNodes <= 6) {
    // For 1-6 nodes: Use direct equidistant angle calculation (like HTML visualizer)
    const ring1Count = totalNodes;
    
    // Original Ring 1 logic with proper rotation
    let startAngle = -Math.PI / 2; // Default: start at top (point up)
    if (ring1Count === 6) {
      startAngle = -Math.PI / 2 + Math.PI / 6; // Rotate by 30° (flat edge at top)
    }
    
    for (let i = 0; i < ring1Count; i++) {
      const angle = (i / ring1Count) * 2 * Math.PI + startAngle;
      const x = RAW_RADII[0] * Math.cos(angle);
      const y = RAW_RADII[0] * Math.sin(angle);
      // Negate Y to convert from screen coordinates (Y-down) to 3D coordinates (Y-up)
      nodePositions.push({
        nodeId: limitedNodes[i].id,
        position: [x, -y, -RAW_DISTANCES[0]]
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
          nodeId: limitedNodes[nodeIndex].id,
          position: allPositions[i]
        });
        nodeIndex++;
      }
    }
  }
  
  // Separate nodes into rings based on approach used
  const ring1Nodes: Array<{ nodeId: string; position: [number, number, number] }> = [];
  const ring2Nodes: Array<{ nodeId: string; position: [number, number, number] }> = [];
  const ring3Nodes: Array<{ nodeId: string; position: [number, number, number] }> = [];
  
  if (totalNodes <= 6) {
    // For 1-6 nodes: All nodes go to ring1 (they're all using Ring 1 positions)
    ring1Nodes.push(...nodePositions);
  } else {
    // For 7+ nodes: Use mask-based ring separation
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
  
  // Calculate center position (only for liminal web mode)
  const centerNode = focusedNodeId ? {
    nodeId: focusedNodeId,
    position: [0, 0, -config.centerDistance] as [number, number, number]
  } : null;
  
  // All nodes that aren't active stay on the sphere
  const activeNodeIds = new Set([
    ...(focusedNodeId ? [focusedNodeId] : []),
    ...limitedNodes.map(n => n.id)
  ]);
  
  const allNodeIds = Array.from(relationshipGraph.nodes.keys());
  const sphereNodes = allNodeIds.filter(nodeId => !activeNodeIds.has(nodeId));
  
  return {
    centerNode,
    ring1Nodes,
    ring2Nodes,
    ring3Nodes,
    sphereNodes
  };
}

// REMOVED: distributeNodesAcrossRings function is no longer needed
// The 42-node coordinate system with boolean masking handles distribution automatically

/**
 * Generate all 42 static node positions using precise coordinate system
 * Preserves existing 3D perspective framework with enhanced positioning logic
 * Note: Y coordinates are negated to convert from HTML canvas coordinates (Y-down) to 3D coordinates (Y-up)
 */
function generateAll42StaticPositions(): [number, number, number][] {
  const allPositions: [number, number, number][] = [];
  
  // Ring 1: Nodes 1-6 (same as existing logic with 30° rotation for flat edge at top)
  const ring1StartAngle = -Math.PI / 2 + Math.PI / 6;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 2 * Math.PI + ring1StartAngle;
    const x = RAW_RADII[0] * Math.cos(angle);
    const y = RAW_RADII[0] * Math.sin(angle);
    // Negate Y to convert from screen coordinates (Y-down) to 3D coordinates (Y-up)
    allPositions.push([x, -y, -RAW_DISTANCES[0]]); // Use existing Ring 1 distance
  }
  
  // Ring 2: Nodes 7-18 (6 edge positions + 6 corner positions)
  const ring2EdgeRadius = RAW_RADII[1] * Math.cos(Math.PI / 6); // cos(30°) = √3/2 ≈ 0.866
  
  // First 6 nodes (7-12): edge positions (reduced radius)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 2 * Math.PI - Math.PI / 2;
    const x = ring2EdgeRadius * Math.cos(angle);
    const y = ring2EdgeRadius * Math.sin(angle);
    // Negate Y to convert from screen coordinates (Y-down) to 3D coordinates (Y-up)
    allPositions.push([x, -y, -RAW_DISTANCES[1]]); // Use existing Ring 2 distance
  }
  
  // Next 6 nodes (13-18): corner positions (full radius)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 2 * Math.PI - Math.PI / 2 + Math.PI / 6;
    const x = RAW_RADII[1] * Math.cos(angle);
    const y = RAW_RADII[1] * Math.sin(angle);
    // Negate Y to convert from screen coordinates (Y-down) to 3D coordinates (Y-up)
    allPositions.push([x, -y, -RAW_DISTANCES[1]]); // Use existing Ring 2 distance
  }
  
  // Ring 3: Nodes 19-42 (6 vertices + 18 edge nodes using path parameterization)
  const hexagonAngles = [30, 90, 150, 210, 270, 330];
  const baseRadius = RAW_RADII[2];
  const vertexPositions: [number, number][] = [];
  
  // Calculate vertex positions (19-24)
  for (let i = 0; i < 6; i++) {
    const angleDegrees = hexagonAngles[i];
    const angleRadians = (angleDegrees - 90) * Math.PI / 180;
    const x = baseRadius * Math.cos(angleRadians);
    const y = baseRadius * Math.sin(angleRadians);
    vertexPositions.push([x, y]);
    // Negate Y to convert from screen coordinates (Y-down) to 3D coordinates (Y-up)
    allPositions.push([x, -y, -RAW_DISTANCES[2]]); // Use existing Ring 3 distance
  }
  
  // Path parameterization helper function
  const lerpPath = (pointA: [number, number], pointB: [number, number], t: number): [number, number] => [
    pointA[0] + t * (pointB[0] - pointA[0]),
    pointA[1] + t * (pointB[1] - pointA[1])
  ];
  
  // Add edge nodes using path parameterization (25-36: t = 1/3, 2/3)
  for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
    const startVertex = vertexPositions[edgeIndex];
    const endVertex = vertexPositions[(edgeIndex + 1) % 6];
    
    for (let nodeOnEdge = 0; nodeOnEdge < 2; nodeOnEdge++) {
      const t = (nodeOnEdge + 1) / 3; // t = 1/3, 2/3
      const [worldX, worldY] = lerpPath(startVertex, endVertex, t);
      // Negate Y to convert from screen coordinates (Y-down) to 3D coordinates (Y-up)
      allPositions.push([worldX, -worldY, -RAW_DISTANCES[2]]);
    }
  }
  
  // Add 6 additional edge midpoint nodes (37-42: t = 0.5)
  for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
    const startVertex = vertexPositions[edgeIndex];
    const endVertex = vertexPositions[(edgeIndex + 1) % 6];
    
    const [worldX, worldY] = lerpPath(startVertex, endVertex, 0.5); // Exact midpoint
    // Negate Y to convert from screen coordinates (Y-down) to 3D coordinates (Y-up)
    allPositions.push([worldX, -worldY, -RAW_DISTANCES[2]]);
  }
  
  return allPositions;
}

/**
 * Generate boolean mask for active nodes based on total node count
 * Implements precise node activation patterns from honeycomb coordinate system
 */
function getActiveMask(totalNodes: number): boolean[] {
  const mask = new Array(42).fill(false);
  
  // Ring 1: Equidistant placement for counts 1-6 (matches HTML visualizer logic)
  if (totalNodes >= 1) {
    const ring1Count = Math.min(totalNodes, 6);
    
    // For equidistant placement, we need to map logical positions to physical indices
    // Generate equidistant indices for Ring 1
    const equidistantIndices: number[] = [];
    
    if (ring1Count === 1) {
      equidistantIndices.push(0); // Top position only
    } else if (ring1Count === 2) {
      equidistantIndices.push(0, 3); // Top and bottom
    } else if (ring1Count === 3) {
      equidistantIndices.push(0, 2, 4); // Every other position for triangle
    } else if (ring1Count === 4) {
      equidistantIndices.push(0, 1, 3, 4); // Skip position 2 and 5 for even distribution
    } else if (ring1Count === 5) {
      equidistantIndices.push(0, 1, 2, 3, 4); // All except position 5
    } else if (ring1Count === 6) {
      equidistantIndices.push(0, 1, 2, 3, 4, 5); // All positions
    }
    
    // Activate the equidistant indices
    equidistantIndices.forEach(index => {
      mask[index] = true;
    });
  }
  
  // If totalNodes <= 6, we're done
  if (totalNodes <= 6) return mask;
  
  // Helper functions for Ring 2 and Ring 3 activation
  const activateRing2 = (mask: boolean[]) => {
    for (let i = 6; i < 18; i++) {
      mask[i] = true; // Nodes 7-18 (indices 6-17)
    }
  };
  
  const activateRing3Nodes = (mask: boolean[], nodeNumbers: number[]) => {
    nodeNumbers.forEach(nodeNum => {
      mask[nodeNum - 1] = true; // Convert 1-based to 0-based indexing
    });
  };
  
  // Ring 2 specific patterns (nodes 7-18)
  if (totalNodes === 7) {
    mask[6] = true; // Node 7
  } else if (totalNodes === 8) {
    mask[6] = true;  // Node 7
    mask[9] = true;  // Node 10
  } else if (totalNodes === 9) {
    mask[6] = true;  // Node 7
    mask[8] = true;  // Node 9
    mask[10] = true; // Node 11
  } else if (totalNodes === 10) {
    mask[11] = true; // Node 12
    mask[7] = true;  // Node 8
    mask[8] = true;  // Node 9
    mask[10] = true; // Node 11
  } else if (totalNodes === 11) {
    mask[6] = true;  // Node 7
    mask[7] = true;  // Node 8
    mask[8] = true;  // Node 9
    mask[10] = true; // Node 11
    mask[11] = true; // Node 12
  } else if (totalNodes === 12) {
    mask[6] = true;  // Node 7
    mask[7] = true;  // Node 8
    mask[8] = true;  // Node 9
    mask[9] = true;  // Node 10
    mask[10] = true; // Node 11
    mask[11] = true; // Node 12
  } else if (totalNodes === 13) {
    mask[6] = true;  // Node 7
    mask[7] = true;  // Node 8
    mask[8] = true;  // Node 9
    mask[14] = true; // Node 15
    mask[15] = true; // Node 16
    mask[10] = true; // Node 11
    mask[11] = true; // Node 12
  } else if (totalNodes === 14) {
    mask[17] = true; // Node 18
    mask[12] = true; // Node 13
    mask[7] = true;  // Node 8
    mask[8] = true;  // Node 9
    mask[14] = true; // Node 15
    mask[15] = true; // Node 16
    mask[10] = true; // Node 11
    mask[11] = true; // Node 12
  } else if (totalNodes === 15) {
    mask[17] = true; // Node 18
    mask[12] = true; // Node 13
    mask[7] = true;  // Node 8
    mask[8] = true;  // Node 9
    mask[14] = true; // Node 15
    mask[15] = true; // Node 16
    mask[10] = true; // Node 11
    mask[11] = true; // Node 12
    mask[6] = true;  // Node 7
  } else if (totalNodes === 16) {
    mask[17] = true; // Node 18
    mask[12] = true; // Node 13
    mask[7] = true;  // Node 8
    mask[8] = true;  // Node 9
    mask[14] = true; // Node 15
    mask[15] = true; // Node 16
    mask[10] = true; // Node 11
    mask[11] = true; // Node 12
    mask[6] = true;  // Node 7
    mask[9] = true;  // Node 10
  } else if (totalNodes === 17) {
    mask[17] = true; // Node 18
    mask[12] = true; // Node 13
    mask[7] = true;  // Node 8
    mask[8] = true;  // Node 9
    mask[14] = true; // Node 15
    mask[15] = true; // Node 16
    mask[10] = true; // Node 11
    mask[11] = true; // Node 12
    mask[6] = true;  // Node 7
    mask[16] = true; // Node 17
    mask[13] = true; // Node 14
  } else if (totalNodes === 18) {
    activateRing2(mask);
  }
  // Ring 3 specific patterns (Ring 1 + Ring 2 always fully active for 19+)
  else if (totalNodes === 19) {
    activateRing2(mask);
    activateRing3Nodes(mask, [42]);
  } else if (totalNodes === 20) {
    activateRing2(mask);
    activateRing3Nodes(mask, [42, 39]);
  } else if (totalNodes === 21) {
    activateRing2(mask);
    activateRing3Nodes(mask, [42, 38, 40]);
  } else if (totalNodes === 22) {
    activateRing2(mask);
    activateRing3Nodes(mask, [37, 38, 40, 41]);
  } else if (totalNodes === 23) {
    activateRing2(mask);
    activateRing3Nodes(mask, [37, 38, 40, 41, 42]);
  } else if (totalNodes === 24) {
    activateRing2(mask);
    activateRing3Nodes(mask, [37, 38, 39, 40, 41, 42]); // Edge midpoints (t=0.5) - one per hexagon edge
  } else if (totalNodes === 25) {
    activateRing2(mask);
    activateRing3Nodes(mask, [37, 38, 40, 41, 42, 29, 30]);
  } else if (totalNodes === 26) {
    activateRing2(mask);
    activateRing3Nodes(mask, [37, 38, 40, 41, 29, 30, 35, 36]);
  } else if (totalNodes >= 27 && totalNodes <= 36) {
    // Complex patterns for 27-36 nodes - preserve explicit logic for geometric clarity
    activateRing2(mask);
    
    if (totalNodes === 27) {
      // Exact pattern from HTML visualizer: 9 Ring 3 nodes
      // First, explicitly clear all Ring 3 positions to prevent contamination
      for (let i = 18; i < 42; i++) { 
        mask[i] = false; 
      }
      
      // Now set ONLY the 9 nodes we want for 27-node pattern
      mask[36] = true; // Node 37 - edge 0 midpoint (t=0.5)
      mask[40] = true; // Node 41 - edge 4 midpoint (t=0.5)
      mask[34] = true; // Node 35 - edge 5, t=2/3
      mask[35] = true; // Node 36 - edge 5, t=2/3 (completing the pair)
      mask[38] = true; // Node 39 - edge 2 midpoint (t=0.5) - BOTTOM NODE
      mask[26] = true; // Node 27 - edge 1, t=1/3
      mask[27] = true; // Node 28 - edge 1, t=2/3
      mask[30] = true; // Node 31 - edge 3, t=1/3
      mask[31] = true; // Node 32 - edge 3, t=2/3
    } else if (totalNodes === 28) {
      mask[36] = true; mask[40] = true; mask[34] = true; mask[35] = true;
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[28] = true;
    } else if (totalNodes === 29) {
      mask[34] = true; mask[35] = true; mask[26] = true; mask[27] = true;
      mask[30] = true; mask[31] = true;
    } else if (totalNodes === 30) {
      mask[34] = true; mask[35] = true; mask[26] = true; mask[27] = true;
      mask[30] = true; mask[31] = true; mask[32] = true; mask[33] = true;
      mask[24] = true;
    } else if (totalNodes === 31) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
    } else if (totalNodes === 32) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[41] = true; mask[18] = true; // Node 24, 42, 19
      mask[20] = true; mask[38] = true; mask[21] = true; // Node 21, 39, 22
    } else if (totalNodes === 33) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[34] = true; mask[35] = true;
    } else if (totalNodes === 34) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[18] = true; // Node 27-28, 31-34, 25-26, 24, 19
      mask[20] = true; mask[21] = true; // Node 21, 22
      mask[34] = true; mask[35] = true; // Node 35, 36
      mask[29] = true; mask[28] = true; // Node 30, 29
    } else if (totalNodes === 35) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[18] = true; // Node 27-28, 31-34, 25-26, 24, 19
      mask[20] = true; mask[21] = true; // Node 21, 22
      mask[34] = true; mask[35] = true; // Node 35, 36
      // Note: Nodes 29, 30 (indices 28, 29) are explicitly OFF
      mask[38] = true; mask[22] = true; mask[19] = true; // Node 39, 23, 20
    } else if (totalNodes === 36) {
      mask[26] = true; mask[27] = true; mask[30] = true; mask[31] = true;
      mask[32] = true; mask[33] = true; mask[24] = true; mask[25] = true;
      mask[23] = true; mask[18] = true; mask[29] = true; mask[28] = true;
    }
  }
  
  return mask;
}

// REMOVED: calculateHexagonalRingPositions function is no longer needed
// The main functions now directly use generateAll42StaticPositions and getActiveMask


/**
 * Calculate ring layout positions for search results (no center node)
 * Uses precise 42-node coordinate system with boolean masking
 */
export function calculateRingLayoutPositionsForSearch(
  orderedNodes: Array<{ id: string; name?: string; type?: string }>,
  relationshipGraph: RelationshipGraph,
  config: RingLayoutConfig = DEFAULT_RING_CONFIG
): RingLayoutPositions {
  console.log('[RingLayout] Input:', {
    orderedNodesReceived: orderedNodes.length,
    orderedNodeIds: orderedNodes.map(n => n.id),
    maxActiveNodes: config.maxActiveNodes
  });
  
  // Apply priority wrapper: Pre-sort nodes to ensure related nodes get priority positions
  const prioritySortedNodes = applyPriorityMapping(orderedNodes, relationshipGraph);
  
  console.log('[RingLayout] After priority mapping:', {
    originalOrder: orderedNodes.map(n => n.id),
    prioritySortedOrder: prioritySortedNodes.map(n => n.id)
  });
  
  // Limit to max active nodes (36 = 6+12+18)
  const limitedNodes = prioritySortedNodes.slice(0, config.maxActiveNodes);
  const totalNodes = limitedNodes.length;
  
  // Map nodes to their positions
  const nodePositions: Array<{ nodeId: string; position: [number, number, number] }> = [];
  
  if (totalNodes <= 6) {
    // For 1-6 nodes: Use direct equidistant angle calculation (like HTML visualizer)
    const ring1Count = totalNodes;
    
    // Original Ring 1 logic with proper rotation
    let startAngle = -Math.PI / 2; // Default: start at top (point up)
    if (ring1Count === 6) {
      startAngle = -Math.PI / 2 + Math.PI / 6; // Rotate by 30° (flat edge at top)
    }
    
    for (let i = 0; i < ring1Count; i++) {
      const angle = (i / ring1Count) * 2 * Math.PI + startAngle;
      const x = RAW_RADII[0] * Math.cos(angle);
      const y = RAW_RADII[0] * Math.sin(angle);
      // Negate Y to convert from screen coordinates (Y-down) to 3D coordinates (Y-up)
      nodePositions.push({
        nodeId: limitedNodes[i].id,
        position: [x, -y, -RAW_DISTANCES[0]]
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
          nodeId: limitedNodes[nodeIndex].id,
          position: allPositions[i]
        });
        nodeIndex++;
      }
    }
  }
  
  // Separate nodes into rings based on approach used
  const ring1Nodes: Array<{ nodeId: string; position: [number, number, number] }> = [];
  const ring2Nodes: Array<{ nodeId: string; position: [number, number, number] }> = [];
  const ring3Nodes: Array<{ nodeId: string; position: [number, number, number] }> = [];
  
  if (totalNodes <= 6) {
    // For 1-6 nodes: All nodes go to ring1 (they're all using Ring 1 positions)
    ring1Nodes.push(...nodePositions);
  } else {
    // For 7+ nodes: Use mask-based ring separation
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
  
  // No center node for search mode
  const centerNode = null;
  
  // All nodes that aren't search results stay on the sphere
  const searchNodeIds = new Set(limitedNodes.map(n => n.id));
  const allNodeIds = Array.from(relationshipGraph.nodes.keys());
  const sphereNodes = allNodeIds.filter(nodeId => !searchNodeIds.has(nodeId));
  
  console.log('[RingLayout] Output classification:', {
    limitedNodesCount: limitedNodes.length,
    ring1Count: ring1Nodes.length,
    ring2Count: ring2Nodes.length,
    ring3Count: ring3Nodes.length,
    sphereNodesCount: sphereNodes.length,
    ring1Ids: ring1Nodes.map(n => n.nodeId),
    ring2Ids: ring2Nodes.map(n => n.nodeId),
    ring3Ids: ring3Nodes.map(n => n.nodeId),
    sphereNodeIds: sphereNodes
  });
  
  return {
    centerNode,
    ring1Nodes,
    ring2Nodes,
    ring3Nodes,
    sphereNodes
  };
}

/**
 * Get layout statistics for debugging
 */
export function getRingLayoutStats(positions: RingLayoutPositions): {
  centerNode: string | null;
  ring1Count: number;
  ring2Count: number;
  ring3Count: number;
  sphereNodesCount: number;
  totalProcessed: number;
} {
  const centerCount = positions.centerNode ? 1 : 0;
  const activeCount = positions.ring1Nodes.length + positions.ring2Nodes.length + positions.ring3Nodes.length;
  
  return {
    centerNode: positions.centerNode?.nodeId || null,
    ring1Count: positions.ring1Nodes.length,
    ring2Count: positions.ring2Nodes.length,
    ring3Count: positions.ring3Nodes.length,
    sphereNodesCount: positions.sphereNodes.length,
    totalProcessed: centerCount + activeCount + positions.sphereNodes.length
  };
}

/**
 * Priority-Preserving Mapping Layer
 * 
 * Wraps the existing mask logic to ensure related nodes (with golden glow) 
 * always occupy inner ring positions without modifying the core mask algorithms.
 * 
 * Strategy: Pre-sort the input list so mask logic naturally assigns
 * inner positions to related nodes and outer positions to unrelated nodes.
 */
function applyPriorityMapping(
  orderedNodes: Array<{ id: string; name?: string; type?: string }>,
  _relationshipGraph: RelationshipGraph
): Array<{ id: string; name?: string; type?: string }> {
  
  // Get current pending relationships from edit mode store
  // Since this is called during edit mode, we can safely access the store
  const store = useInterBrainStore.getState();
  const pendingRelationshipIds = store.editMode.pendingRelationships || [];
  
  console.log('[PriorityMapping] Input analysis:', {
    totalNodes: orderedNodes.length,
    pendingRelationshipIds,
    nodeIds: orderedNodes.map(n => n.id)
  });
  
  // Separate nodes into related (golden glow) and unrelated groups
  const relatedNodes: typeof orderedNodes = [];
  const unrelatedNodes: typeof orderedNodes = [];
  
  orderedNodes.forEach(node => {
    if (pendingRelationshipIds.includes(node.id)) {
      relatedNodes.push(node);
    } else {
      unrelatedNodes.push(node);
    }
  });
  
  // Priority order: Related nodes first (will get inner ring positions),
  // then unrelated nodes (will get outer ring positions)
  const prioritySortedNodes = [...relatedNodes, ...unrelatedNodes];
  
  console.log('[PriorityMapping] Output analysis:', {
    relatedCount: relatedNodes.length,
    unrelatedCount: unrelatedNodes.length,
    relatedIds: relatedNodes.map(n => n.id),
    unrelatedIds: unrelatedNodes.map(n => n.id),
    finalOrder: prioritySortedNodes.map(n => n.id)
  });
  
  return prioritySortedNodes;
}