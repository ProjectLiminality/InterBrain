/**
 * Constellation Layout Configuration
 *
 * Configuration types and default values for the constellation layout algorithm.
 * Based on the proven parameters from the HTML prototype.
 */

import { Vector3 } from 'three';

/**
 * Configuration for constellation layout algorithm
 */
export interface ConstellationLayoutConfig {
  /** Proportion of sphere surface covered by clusters (0-1) */
  coverageFactor: number;

  /** Minimum radius for any cluster (radians) */
  minRadius: number;

  /** Number of iterations for force-directed layout */
  forceIterations: number;

  /** Number of refinement iterations for cluster overlap elimination */
  refinementIterations: number;

  /** Margin between clusters during refinement (radians) */
  refinementMargin: number;

  /** Sphere radius for final positioning */
  sphereRadius: number;

  /** Repulsion strength multiplier for force-directed layout */
  repulsionStrength: number;

  /** Attraction strength multiplier for force-directed layout */
  attractionStrength: number;

  /** Initial cooling temperature for force-directed layout */
  initialTemperature: number;
}

/**
 * Default configuration based on HTML prototype optimal values
 */
export const DEFAULT_CONSTELLATION_CONFIG: ConstellationLayoutConfig = {
  coverageFactor: 0.7,
  minRadius: 0.1,
  forceIterations: 100,
  refinementIterations: 50,
  refinementMargin: 0.02,
  sphereRadius: 5000,
  repulsionStrength: 1.0,
  attractionStrength: 1.0,
  initialTemperature: 0.1
};

/**
 * Result of constellation layout computation
 */
export interface ConstellationLayoutResult {
  /** Final positions for each node */
  nodePositions: Map<string, [number, number, number]>;

  /** Computed clusters with their properties */
  clusters: ConstellationCluster[];

  /** Performance and statistics */
  stats: LayoutStatistics;
}

/**
 * A cluster in the constellation layout
 */
export interface ConstellationCluster {
  /** Unique cluster ID */
  id: number;

  /** Array of node IDs in this cluster */
  nodeIds: string[];

  /** Center position on unit sphere */
  center: Vector3;

  /** Angular radius of cluster (radians) */
  radius: number;

  /** Visual color for the cluster */
  color: string;

  /** Size (number of nodes) */
  size: number;
}

/**
 * Layout computation statistics
 */
export interface LayoutStatistics {
  /** Total computation time in milliseconds */
  computationTimeMs: number;

  /** Number of clusters created */
  totalClusters: number;

  /** Number of nodes positioned */
  totalNodes: number;

  /** Number of edges processed */
  totalEdges: number;

  /** Number of standalone (isolated) nodes */
  standaloneNodes: number;

  /** Largest cluster size */
  largestClusterSize: number;

  /** Average cluster size */
  averageClusterSize: number;

  /** Whether cluster refinement eliminated overlaps */
  refinementSuccessful: boolean;
}

/**
 * 2D position in tangent plane
 */
export interface PlanarPosition {
  x: number;
  y: number;
}

/**
 * Tangent plane basis vectors for spherical projection
 */
export interface TangentBasis {
  /** First basis vector (tangent to sphere) */
  e1: Vector3;

  /** Second basis vector (tangent to sphere, orthogonal to e1) */
  e2: Vector3;
}

/**
 * Force vector for force-directed layout
 */
export interface ForceVector {
  x: number;
  y: number;
}

/**
 * Color palette for clusters (from HTML prototype)
 */
export const CLUSTER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffa726',
  '#ab47bc', '#ef5350', '#26c6da', '#66bb6a', '#ffee58',
  '#8d6e63', '#bdbdbd', '#ff8a65', '#81c784', '#64b5f6'
];

/**
 * Validate constellation layout configuration
 */
export function validateConfig(config: ConstellationLayoutConfig): string[] {
  const errors: string[] = [];

  if (config.coverageFactor <= 0 || config.coverageFactor > 1) {
    errors.push('Coverage factor must be between 0 and 1');
  }

  if (config.minRadius <= 0) {
    errors.push('Minimum radius must be positive');
  }

  if (config.forceIterations < 1) {
    errors.push('Force iterations must be at least 1');
  }

  if (config.refinementIterations < 0) {
    errors.push('Refinement iterations must be non-negative');
  }

  if (config.sphereRadius <= 0) {
    errors.push('Sphere radius must be positive');
  }

  return errors;
}

/**
 * Create a configuration with overrides
 */
export function createConfig(overrides: Partial<ConstellationLayoutConfig> = {}): ConstellationLayoutConfig {
  return {
    ...DEFAULT_CONSTELLATION_CONFIG,
    ...overrides
  };
}