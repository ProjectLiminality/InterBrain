/**
 * Ring Layout Position Calculator
 * 
 * Unified positioning algorithms for both liminal web and semantic search layouts.
 * Implements center + hexagonal ring pattern with scalable distribution up to 36 nodes.
 */

import { RelationshipGraph } from '../../utils/relationship-graph';

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

/**
 * Calculate perspective-corrected distances for visual scaling
 * Each ring should appear progressively smaller in a visually pleasing way
 */
export function calculatePerspectiveCorrectedDistances(
  baseDistance: number,
  scalingFactor: number = 0.7  // Each ring appears 70% the size of the previous one
): [number, number, number] {
  const ring1Distance = baseDistance;
  // For ring2 to appear 70% the size, it needs to be 1/0.7 = 1.43x further away
  const ring2Distance = Math.round(ring1Distance / scalingFactor);
  // For ring3 to appear 70% the size of ring2, it needs to be further yet
  const ring3Distance = Math.round(ring2Distance / scalingFactor);
  
  return [ring1Distance, ring2Distance, ring3Distance];
}

/**
 * Calculate world-space radii that account for perspective distortion
 * Outer rings need larger radii to maintain visual spacing
 */
export function calculatePerspectiveCorrectedRadii(
  baseRadius: number,
  distances: [number, number, number]
): [number, number, number] {
  const [ring1Distance, ring2Distance, ring3Distance] = distances;
  const baseDistance = ring1Distance;
  
  // Radius needs to scale proportionally with distance to maintain visual size
  const ring1Radius = baseRadius;
  const ring2Radius = Math.round(baseRadius * (ring2Distance / baseDistance));
  const ring3Radius = Math.round(baseRadius * (ring3Distance / baseDistance));
  
  return [ring1Radius, ring2Radius, ring3Radius];
}

// Calculate perspective-corrected values
const PERSPECTIVE_CORRECTED_DISTANCES = calculatePerspectiveCorrectedDistances(100, 0.75); // 75% size scaling
const PERSPECTIVE_CORRECTED_RADII = calculatePerspectiveCorrectedRadii(60, PERSPECTIVE_CORRECTED_DISTANCES);

// Log the calculated values for reference during development
console.log('Ring Layout: Perspective-corrected distances:', PERSPECTIVE_CORRECTED_DISTANCES);
console.log('Ring Layout: Perspective-corrected radii:', PERSPECTIVE_CORRECTED_RADII);

/**
 * Default configuration for ring layout positioning
 */
export const DEFAULT_RING_CONFIG: RingLayoutConfig = {
  centerDistance: 50,                      // Close to camera = large visual size
  ringDistances: PERSPECTIVE_CORRECTED_DISTANCES,  // Ring 1, 2, 3 distances (perspective corrected)
  ringRadii: PERSPECTIVE_CORRECTED_RADII,          // Ring 1, 2, 3 radii in world space
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
 * Supports both liminal web mode (with center) and search mode (no center)
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
  
  // Distribute nodes across rings based on count
  const { ring1, ring2, ring3 } = distributeNodesAcrossRings(limitedNodes);
  
  // Calculate positions for each ring
  const ring1Positions = calculateHexagonalRingPositions(6, config.ringRadii[0], -config.ringDistances[0]);
  const ring2Positions = calculateHexagonalRingPositions(12, config.ringRadii[1], -config.ringDistances[1]);
  const ring3Positions = calculateHexagonalRingPositions(18, config.ringRadii[2], -config.ringDistances[2]);
  
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
    ring1Nodes: ring1.map((node, index) => ({
      nodeId: node.id,
      position: ring1Positions[index] || [0, 0, -config.ringDistances[0]]
    })),
    ring2Nodes: ring2.map((node, index) => ({
      nodeId: node.id,
      position: ring2Positions[index] || [0, 0, -config.ringDistances[1]]
    })),
    ring3Nodes: ring3.map((node, index) => ({
      nodeId: node.id,
      position: ring3Positions[index] || [0, 0, -config.ringDistances[2]]
    })),
    sphereNodes
  };
}

/**
 * Distribute nodes across the three hexagonal rings based on priority order
 * Ring 1: 6 nodes, Ring 2: 12 nodes, Ring 3: 18 nodes
 */
function distributeNodesAcrossRings(
  orderedNodes: Array<{ id: string; name?: string; type?: string }>
): {
  ring1: Array<{ id: string; name?: string; type?: string }>;
  ring2: Array<{ id: string; name?: string; type?: string }>;
  ring3: Array<{ id: string; name?: string; type?: string }>;
} {
  const ring1 = orderedNodes.slice(0, 6);
  const ring2 = orderedNodes.slice(6, 18);  // 6-17 = 12 nodes
  const ring3 = orderedNodes.slice(18, 36); // 18-35 = 18 nodes
  
  return { ring1, ring2, ring3 };
}

/**
 * Calculate hexagonal ring positions with proper node count distribution
 * Supports 6, 12, and 18 node patterns for rings 1, 2, and 3
 */
function calculateHexagonalRingPositions(
  maxNodes: number,
  radius: number,
  zDistance: number
): [number, number, number][] {
  if (maxNodes === 0) return [];
  
  const positions: [number, number, number][] = [];
  
  if (maxNodes <= 6) {
    // Ring 1: Simple hexagon (6 nodes max)
    for (let i = 0; i < Math.min(maxNodes, 6); i++) {
      const angle = (i / 6) * 2 * Math.PI;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      positions.push([x, y, zDistance]);
    }
  } else if (maxNodes <= 12) {
    // Ring 2: Double hexagon pattern (12 nodes max)
    // 6 nodes on main vertices, 6 nodes on edge midpoints
    for (let i = 0; i < Math.min(maxNodes, 12); i++) {
      let angle: number;
      let currentRadius: number;
      
      if (i < 6) {
        // Main hexagon vertices
        angle = (i / 6) * 2 * Math.PI;
        currentRadius = radius;
      } else {
        // Edge midpoints (offset by 30 degrees)
        angle = ((i - 6) / 6) * 2 * Math.PI + Math.PI / 6;
        currentRadius = radius * 0.866; // Slightly closer to center
      }
      
      const x = currentRadius * Math.cos(angle);
      const y = currentRadius * Math.sin(angle);
      positions.push([x, y, zDistance]);
    }
  } else {
    // Ring 3: Triple hexagon pattern (18 nodes max)
    // 6 vertices + 6 edge midpoints + 6 inner ring
    for (let i = 0; i < Math.min(maxNodes, 18); i++) {
      let angle: number;
      let currentRadius: number;
      
      if (i < 6) {
        // Outer hexagon vertices
        angle = (i / 6) * 2 * Math.PI;
        currentRadius = radius;
      } else if (i < 12) {
        // Edge midpoints
        angle = ((i - 6) / 6) * 2 * Math.PI + Math.PI / 6;
        currentRadius = radius * 0.866;
      } else {
        // Inner ring
        angle = ((i - 12) / 6) * 2 * Math.PI;
        currentRadius = radius * 0.5;
      }
      
      const x = currentRadius * Math.cos(angle);
      const y = currentRadius * Math.sin(angle);
      positions.push([x, y, zDistance]);
    }
  }
  
  return positions;
}


/**
 * Calculate ring layout positions for search results (no center node)
 * Takes an ordered list of search result nodes and distributes them across rings
 */
export function calculateRingLayoutPositionsForSearch(
  orderedNodes: Array<{ id: string; name?: string; type?: string }>,
  relationshipGraph: RelationshipGraph,
  config: RingLayoutConfig = DEFAULT_RING_CONFIG
): RingLayoutPositions {
  // Limit to max active nodes (36 = 6+12+18)
  const limitedNodes = orderedNodes.slice(0, config.maxActiveNodes);
  
  // Distribute nodes across rings based on count
  const { ring1, ring2, ring3 } = distributeNodesAcrossRings(limitedNodes);
  
  // Calculate positions for each ring
  const ring1Positions = calculateHexagonalRingPositions(6, config.ringRadii[0], -config.ringDistances[0]);
  const ring2Positions = calculateHexagonalRingPositions(12, config.ringRadii[1], -config.ringDistances[1]);
  const ring3Positions = calculateHexagonalRingPositions(18, config.ringRadii[2], -config.ringDistances[2]);
  
  // No center node for search mode (leave center empty for future search query node)
  const centerNode = null;
  
  // All nodes that aren't search results stay on the sphere
  const searchNodeIds = new Set(limitedNodes.map(n => n.id));
  const allNodeIds = Array.from(relationshipGraph.nodes.keys());
  const sphereNodes = allNodeIds.filter(nodeId => !searchNodeIds.has(nodeId));
  
  return {
    centerNode,
    ring1Nodes: ring1.map((node, index) => ({
      nodeId: node.id,
      position: ring1Positions[index] || [0, 0, -config.ringDistances[0]]
    })),
    ring2Nodes: ring2.map((node, index) => ({
      nodeId: node.id,
      position: ring2Positions[index] || [0, 0, -config.ringDistances[1]]
    })),
    ring3Nodes: ring3.map((node, index) => ({
      nodeId: node.id,
      position: ring3Positions[index] || [0, 0, -config.ringDistances[2]]
    })),
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