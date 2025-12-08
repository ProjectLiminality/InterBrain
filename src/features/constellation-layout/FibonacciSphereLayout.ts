/**
 * Fibonacci Sphere Layout Algorithm
 * 
 * Proven spatial distribution algorithm for arranging DreamNodes in 3D space
 * using the golden ratio for mathematically optimal even distribution.
 * 
 * Based on the prototype implementation and mathematical principles from
 * docs/technical-patterns.md
 */

export interface FibonacciSphereConfig {
  /** Radius of the sphere containing all nodes */
  radius: number;
  /** Total number of nodes to distribute */
  nodeCount: number;
  /** Optional offset for the center of the sphere */
  center?: [number, number, number];
}

export interface FibonacciSpherePosition {
  /** 3D position coordinates [x, y, z] */
  position: [number, number, number];
  /** Index in the sequence (0 to nodeCount-1) */
  index: number;
  /** Normalized position on unit sphere (before scaling by radius) */
  normalized: [number, number, number];
}

/**
 * Golden ratio constant for Fibonacci sphere distribution
 */
const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

/**
 * Calculate Fibonacci sphere positions for a given configuration
 * 
 * This algorithm distributes points evenly on a sphere using the golden ratio
 * to minimize clustering and create natural-looking constellation patterns.
 * 
 * Mathematical approach:
 * - phi: latitude angle calculated to distribute points evenly in rings
 * - theta: longitude angle using golden ratio for optimal spiral distribution
 * - Cartesian conversion: spherical coordinates → (x,y,z)
 */
export function calculateFibonacciSpherePositions(config: FibonacciSphereConfig): FibonacciSpherePosition[] {
  const { radius, nodeCount, center = [0, 0, 0] } = config;
  const positions: FibonacciSpherePosition[] = [];
  
  for (let i = 0; i < nodeCount; i++) {
    // Calculate spherical coordinates using Fibonacci sequence
    const phi = Math.acos(1 - 2 * i / (nodeCount + 1));
    const theta = 2 * Math.PI * i / GOLDEN_RATIO;
    
    // Convert to Cartesian coordinates on unit sphere
    const x_norm = Math.sin(phi) * Math.cos(theta);
    const y_norm = Math.sin(phi) * Math.sin(theta);
    const z_norm = Math.cos(phi);
    
    // Scale by radius and apply center offset
    const x = radius * x_norm + center[0];
    const y = radius * y_norm + center[1];
    const z = radius * z_norm + center[2];
    
    positions.push({
      position: [x, y, z],
      index: i,
      normalized: [x_norm, y_norm, z_norm]
    });
  }
  
  return positions;
}

/**
 * Update positions for a subset of nodes (useful for dynamic layouts)
 * 
 * Maintains mathematical consistency when node count changes by
 * recalculating the entire distribution.
 */
export function updateFibonacciSpherePositions(
  existingPositions: FibonacciSpherePosition[],
  newConfig: FibonacciSphereConfig
): FibonacciSpherePosition[] {
  // Always recalculate from scratch to maintain mathematical accuracy
  return calculateFibonacciSpherePositions(newConfig);
}

/**
 * Get position for a single node at a specific index
 * Useful for adding individual nodes without recalculating all positions
 */
export function getFibonacciSpherePosition(
  index: number, 
  config: FibonacciSphereConfig
): FibonacciSpherePosition {
  const { radius, nodeCount, center = [0, 0, 0] } = config;
  
  const phi = Math.acos(1 - 2 * index / (nodeCount + 1));
  const theta = 2 * Math.PI * index / GOLDEN_RATIO;
  
  const x_norm = Math.sin(phi) * Math.cos(theta);
  const y_norm = Math.sin(phi) * Math.sin(theta);  
  const z_norm = Math.cos(phi);
  
  const x = radius * x_norm + center[0];
  const y = radius * y_norm + center[1];
  const z = radius * z_norm + center[2];
  
  return {
    position: [x, y, z],
    index,
    normalized: [x_norm, y_norm, z_norm]
  };
}

/**
 * Default configuration values based on prototype testing
 * 
 * NIGHT SKY SCALING: Radius significantly increased for true night sky proportions
 * - Current DreamNode size: 240px
 * - At 5000 radius: Nodes appear appropriately small for stargazing experience
 * - Allows for distance-based scaling without CSS complications
 */
export const DEFAULT_FIBONACCI_CONFIG: FibonacciSphereConfig = {
  radius: 5000,
  nodeCount: 12,
  center: [0, 0, 0]
};

/**
 * Validate Fibonacci sphere configuration
 */
export function validateFibonacciConfig(config: FibonacciSphereConfig): boolean {
  return (
    config.radius > 0 &&
    config.nodeCount > 0 &&
    Number.isFinite(config.radius) &&
    Number.isInteger(config.nodeCount) &&
    (!config.center || (Array.isArray(config.center) && config.center.length === 3))
  );
}