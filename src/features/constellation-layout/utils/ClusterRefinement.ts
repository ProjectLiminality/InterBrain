/**
 * Cluster Refinement Utilities
 *
 * Algorithms for eliminating overlaps between spherical clusters and optimizing
 * their global positioning on the sphere surface. Implements iterative refinement
 * to ensure visual clarity and proper spacing.
 */

import { Vector3 } from 'three';
import { ConstellationCluster, ConstellationLayoutConfig } from '../LayoutConfig';
import { geodesicDistance, sphericalCapsOverlap } from './SphericalProjection';

/**
 * Result of cluster refinement process
 */
export interface ClusterRefinementResult {
  /** Updated cluster positions after refinement */
  clusters: ConstellationCluster[];

  /** Whether refinement successfully eliminated all overlaps */
  success: boolean;

  /** Number of iterations performed */
  iterations: number;

  /** Number of overlaps remaining after refinement */
  remainingOverlaps: number;

  /** Total displacement during refinement */
  totalDisplacement: number;
}

/**
 * Refine cluster positions to eliminate overlaps
 *
 * Uses iterative spring-mass simulation to push overlapping clusters apart
 * while maintaining roughly even distribution on the sphere surface.
 *
 * @param clusters Initial cluster configuration
 * @param config Layout configuration
 * @returns Refinement result with updated positions
 */
export function refineClusterPositions(
  clusters: ConstellationCluster[],
  config: ConstellationLayoutConfig
): ClusterRefinementResult {
  if (clusters.length <= 1) {
    return {
      clusters: [...clusters],
      success: true,
      iterations: 0,
      remainingOverlaps: 0,
      totalDisplacement: 0
    };
  }

  let workingClusters = clusters.map(cluster => ({
    ...cluster,
    center: cluster.center.clone()
  }));

  let totalDisplacement = 0;
  let iteration = 0;

  for (iteration = 0; iteration < config.refinementIterations; iteration++) {
    const forces = new Map<number, Vector3>();

    // Initialize forces
    for (const cluster of workingClusters) {
      forces.set(cluster.id, new Vector3(0, 0, 0));
    }

    let hasOverlaps = false;

    // Calculate repulsive forces between overlapping clusters
    for (let i = 0; i < workingClusters.length; i++) {
      for (let j = i + 1; j < workingClusters.length; j++) {
        const cluster1 = workingClusters[i];
        const cluster2 = workingClusters[j];

        const distance = geodesicDistance(cluster1.center, cluster2.center);
        const requiredDistance = cluster1.radius + cluster2.radius + config.refinementMargin;

        if (distance < requiredDistance) {
          hasOverlaps = true;

          // Calculate repulsive force magnitude
          const overlap = requiredDistance - distance;
          const forceMagnitude = overlap * 0.5; // Spring constant

          // Direction from cluster2 to cluster1
          const direction = cluster1.center.clone()
            .sub(cluster2.center)
            .normalize();

          // Apply equal and opposite forces
          const force = direction.multiplyScalar(forceMagnitude);
          forces.get(cluster1.id)!.add(force);
          forces.get(cluster2.id)!.sub(force);
        }
      }
    }

    // If no overlaps, we're done
    if (!hasOverlaps) {
      break;
    }

    // Apply forces with damping
    const damping = 0.8;
    let iterationDisplacement = 0;

    for (const cluster of workingClusters) {
      const force = forces.get(cluster.id)!;
      const forceMagnitude = force.length();

      if (forceMagnitude > 1e-10) {
        // Apply force to cluster center
        const displacement = force.clone().multiplyScalar(damping / Math.max(1, forceMagnitude));
        cluster.center.add(displacement);

        // Project back to unit sphere
        cluster.center.normalize();

        iterationDisplacement += displacement.length();
      }
    }

    totalDisplacement += iterationDisplacement;

    // Convergence check
    if (iterationDisplacement < 1e-6) {
      break;
    }
  }

  // Count remaining overlaps
  let remainingOverlaps = 0;
  for (let i = 0; i < workingClusters.length; i++) {
    for (let j = i + 1; j < workingClusters.length; j++) {
      const cluster1 = workingClusters[i];
      const cluster2 = workingClusters[j];

      if (sphericalCapsOverlap(
        cluster1.center, cluster1.radius,
        cluster2.center, cluster2.radius
      )) {
        remainingOverlaps++;
      }
    }
  }

  return {
    clusters: workingClusters,
    success: remainingOverlaps === 0,
    iterations: iteration,
    remainingOverlaps,
    totalDisplacement
  };
}

/**
 * Optimize cluster distribution using simulated annealing
 *
 * Alternative refinement method that uses probabilistic moves to find
 * better cluster configurations.
 *
 * @param clusters Initial cluster configuration
 * @param config Layout configuration
 * @param temperature Initial temperature for annealing
 * @returns Optimized cluster configuration
 */
export function optimizeClusterDistribution(
  clusters: ConstellationCluster[],
  config: ConstellationLayoutConfig,
  temperature: number = 1.0
): ConstellationCluster[] {
  if (clusters.length <= 1) {
    return clusters;
  }

  let currentClusters = clusters.map(cluster => ({
    ...cluster,
    center: cluster.center.clone()
  }));

  let currentEnergy = calculateDistributionEnergy(currentClusters, config);
  const coolingRate = 0.95;
  const minTemperature = 0.01;

  while (temperature > minTemperature) {
    // Make a random move
    const clusterIndex = Math.floor(Math.random() * currentClusters.length);
    const cluster = currentClusters[clusterIndex];
    const oldCenter = cluster.center.clone();

    // Generate random perturbation
    const perturbation = new Vector3(
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.1
    );

    cluster.center.add(perturbation).normalize();

    // Calculate new energy
    const newEnergy = calculateDistributionEnergy(currentClusters, config);
    const deltaEnergy = newEnergy - currentEnergy;

    // Accept or reject the move
    const probability = deltaEnergy <= 0 ? 1 : Math.exp(-deltaEnergy / temperature);

    if (Math.random() < probability) {
      currentEnergy = newEnergy;
    } else {
      // Reject move - restore old position
      cluster.center.copy(oldCenter);
    }

    temperature *= coolingRate;
  }

  return currentClusters;
}

/**
 * Calculate distribution energy for cluster configuration
 *
 * Lower energy indicates better spacing and fewer overlaps.
 * Energy function considers:
 * - Overlap penalties
 * - Spacing uniformity
 * - Size-based positioning preferences
 */
function calculateDistributionEnergy(
  clusters: ConstellationCluster[],
  config: ConstellationLayoutConfig
): number {
  let energy = 0;

  // Overlap penalty
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const cluster1 = clusters[i];
      const cluster2 = clusters[j];

      const distance = geodesicDistance(cluster1.center, cluster2.center);
      const requiredDistance = cluster1.radius + cluster2.radius + config.refinementMargin;

      if (distance < requiredDistance) {
        const overlap = requiredDistance - distance;
        energy += overlap * overlap * 1000; // High penalty for overlaps
      }
    }
  }

  // Spacing uniformity penalty (encourage even distribution)
  const expectedDistance = Math.PI / Math.sqrt(clusters.length);
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const distance = geodesicDistance(clusters[i].center, clusters[j].center);
      const deviation = Math.abs(distance - expectedDistance);
      energy += deviation * deviation * 10;
    }
  }

  return energy;
}

/**
 * Check if cluster configuration has any overlaps
 *
 * @param clusters Cluster configuration to check
 * @param margin Additional margin to require between clusters
 * @returns True if any clusters overlap
 */
export function hasClusterOverlaps(
  clusters: ConstellationCluster[],
  margin: number = 0
): boolean {
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const cluster1 = clusters[i];
      const cluster2 = clusters[j];

      const distance = geodesicDistance(cluster1.center, cluster2.center);
      const requiredDistance = cluster1.radius + cluster2.radius + margin;

      if (distance < requiredDistance) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Find the minimum margin required to eliminate all overlaps
 *
 * @param clusters Cluster configuration
 * @returns Minimum margin needed
 */
export function findMinimumMargin(clusters: ConstellationCluster[]): number {
  let maxOverlap = 0;

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const cluster1 = clusters[i];
      const cluster2 = clusters[j];

      const distance = geodesicDistance(cluster1.center, cluster2.center);
      const requiredDistance = cluster1.radius + cluster2.radius;
      const overlap = requiredDistance - distance;

      maxOverlap = Math.max(maxOverlap, overlap);
    }
  }

  return Math.max(0, maxOverlap);
}

/**
 * Sort clusters by size for better initial positioning
 *
 * Larger clusters should be positioned first to get better locations,
 * similar to bin packing algorithms.
 *
 * @param clusters Clusters to sort
 * @returns Sorted clusters (largest first)
 */
export function sortClustersBySize(clusters: ConstellationCluster[]): ConstellationCluster[] {
  return [...clusters].sort((a, b) => b.size - a.size);
}