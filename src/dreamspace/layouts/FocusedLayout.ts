/**
 * Focused Layout Position Calculator
 * 
 * Core positioning algorithms for liminal web focused layouts.
 * Implements center + inner circle pattern with perfect mathematical distribution.
 */

import { RelationshipGraph } from '../../utils/relationship-graph';

/**
 * Configuration for focused layout positioning
 */
export interface FocusedLayoutConfig {
  /** Distance from camera for centered/focused node (appears largest) */
  centerDistance: number;
  
  /** Distance from camera for inner circle nodes (related nodes) */
  innerCircleDistance: number;
  
  /** Distance from camera for outer circle nodes (second-degree, hidden buffer) */
  outerCircleDistance: number;
  
  /** Radius of inner circle for related nodes */
  innerCircleRadius: number;
  
  /** Radius of outer circle for second-degree nodes */
  outerCircleRadius: number;
  
  /** Maximum nodes to show in inner circle (performance limit) */
  maxInnerConnections: number;
  
  /** Maximum nodes to preload in outer circle (buffer limit) */
  maxOuterConnections: number;
}

/**
 * Default configuration based on VALUABLE_WORK_EXTRACTION.md insights
 */
export const DEFAULT_FOCUSED_CONFIG: FocusedLayoutConfig = {
  centerDistance: 50,        // Close to camera = large visual size
  innerCircleDistance: 100,  // Medium distance = medium visual size  
  outerCircleDistance: 600,  // Far distance = hidden buffer
  innerCircleRadius: 60,     // Fixed radius for inner circle
  outerCircleRadius: 600,    // Large radius for outer buffer
  maxInnerConnections: 12,   // Reasonable limit for inner circle
  maxOuterConnections: 50    // Preload buffer for smooth transitions
};

/**
 * Result of focused layout position calculation
 */
export interface FocusedLayoutPositions {
  /** Center node position */
  centerNode: {
    nodeId: string;
    position: [number, number, number];
  };
  
  /** Inner circle node positions (visible related nodes) */
  innerCircleNodes: Array<{
    nodeId: string;
    position: [number, number, number];
  }>;
  
  /** Outer circle node positions (hidden buffer nodes) */
  outerCircleNodes: Array<{
    nodeId: string;
    position: [number, number, number];
  }>;
  
  /** Nodes that should be hidden/dissolved */
  hiddenNodes: string[];
}

/**
 * Calculate focused layout positions for a given center node
 * Uses relationship graph for efficient queries and opposite-type filtering
 */
export function calculateFocusedLayoutPositions(
  focusedNodeId: string,
  relationshipGraph: RelationshipGraph,
  config: FocusedLayoutConfig = DEFAULT_FOCUSED_CONFIG
): FocusedLayoutPositions {
  const focusedNode = relationshipGraph.nodes.get(focusedNodeId);
  if (!focusedNode) {
    throw new Error(`Focused node ${focusedNodeId} not found in relationship graph`);
  }
  
  // Get opposite-type connections (Dreams ↔ Dreamers only)
  const relatedNodes = relationshipGraph.getOppositeTypeConnections(focusedNodeId);
  const secondDegreeNodes = relationshipGraph.getSecondDegreeConnections(focusedNodeId);
  
  // Limit nodes for performance
  const limitedInnerNodes = relatedNodes.slice(0, config.maxInnerConnections);
  const limitedOuterNodes = secondDegreeNodes.slice(0, config.maxOuterConnections);
  
  // Calculate center position
  const centerPosition: [number, number, number] = [0, 0, -config.centerDistance];
  
  // Calculate inner circle positions (equidistant around center)
  const innerCirclePositions = calculateCirclePositions(
    limitedInnerNodes.length,
    config.innerCircleRadius,
    -config.innerCircleDistance  // Z coordinate (distance from camera)
  );
  
  // Calculate outer circle positions (hidden buffer)
  const outerCirclePositions = calculateCirclePositions(
    limitedOuterNodes.length,
    config.outerCircleRadius,
    -config.outerCircleDistance  // Z coordinate (far from camera)
  );
  
  // Determine hidden nodes (all nodes not in focus, inner, or outer circles)
  const activeNodeIds = new Set([
    focusedNodeId,
    ...limitedInnerNodes.map(n => n.id),
    ...limitedOuterNodes.map(n => n.id)
  ]);
  
  const allNodeIds = Array.from(relationshipGraph.nodes.keys());
  const hiddenNodes = allNodeIds.filter(nodeId => !activeNodeIds.has(nodeId));
  
  return {
    centerNode: {
      nodeId: focusedNodeId,
      position: centerPosition
    },
    innerCircleNodes: limitedInnerNodes.map((node, index) => ({
      nodeId: node.id,
      position: innerCirclePositions[index]
    })),
    outerCircleNodes: limitedOuterNodes.map((node, index) => ({
      nodeId: node.id,
      position: outerCirclePositions[index]
    })),
    hiddenNodes
  };
}

/**
 * Calculate equidistant positions on a circle
 * Uses trigonometric distribution for perfect spacing
 */
function calculateCirclePositions(
  nodeCount: number,
  radius: number,
  zDistance: number
): [number, number, number][] {
  if (nodeCount === 0) return [];
  
  const positions: [number, number, number][] = [];
  
  for (let i = 0; i < nodeCount; i++) {
    // Calculate angle for even distribution around circle
    const angle = (i / nodeCount) * 2 * Math.PI;
    
    // Convert to Cartesian coordinates
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const z = zDistance;
    
    positions.push([x, y, z]);
  }
  
  return positions;
}

/**
 * Get layout statistics for debugging
 */
export function getFocusedLayoutStats(positions: FocusedLayoutPositions): {
  centerNode: string;
  innerCircleCount: number;
  outerCircleCount: number;
  hiddenCount: number;
  totalProcessed: number;
} {
  return {
    centerNode: positions.centerNode.nodeId,
    innerCircleCount: positions.innerCircleNodes.length,
    outerCircleCount: positions.outerCircleNodes.length,
    hiddenCount: positions.hiddenNodes.length,
    totalProcessed: 1 + positions.innerCircleNodes.length + positions.outerCircleNodes.length + positions.hiddenNodes.length
  };
}