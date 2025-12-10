import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  refineClusterPositions,
  hasClusterOverlaps,
  findMinimumMargin,
  sortClustersBySize
} from './ClusterRefinement';
import { ConstellationCluster, DEFAULT_CONSTELLATION_CONFIG } from '../LayoutConfig';

/**
 * Helper to create test cluster
 */
function createCluster(
  id: number,
  center: [number, number, number],
  radius: number,
  size: number
): ConstellationCluster {
  return {
    id,
    nodeIds: Array.from({ length: size }, (_, i) => `node-${id}-${i}`),
    center: new Vector3(...center).normalize(),
    radius,
    color: `#${id.toString(16).padStart(6, '0')}`,
    size
  };
}

describe('ClusterRefinement', () => {
  describe('refineClusterPositions', () => {
    it('should handle empty cluster array', () => {
      const result = refineClusterPositions([], DEFAULT_CONSTELLATION_CONFIG);

      expect(result.clusters).toHaveLength(0);
      expect(result.success).toBe(true);
      expect(result.iterations).toBe(0);
      expect(result.remainingOverlaps).toBe(0);
    });

    it('should handle single cluster', () => {
      const clusters = [createCluster(0, [0, 0, 1], 0.3, 5)];

      const result = refineClusterPositions(clusters, DEFAULT_CONSTELLATION_CONFIG);

      expect(result.clusters).toHaveLength(1);
      expect(result.success).toBe(true);
      expect(result.remainingOverlaps).toBe(0);
    });

    it('should separate overlapping clusters', () => {
      // Create two clusters very close together (overlapping)
      const clusters = [
        createCluster(0, [0, 0, 1], 0.3, 5),
        createCluster(1, [0.1, 0, 0.995], 0.3, 5) // Very close to first
      ];

      // They should initially overlap
      expect(hasClusterOverlaps(clusters)).toBe(true);

      const result = refineClusterPositions(clusters, DEFAULT_CONSTELLATION_CONFIG);

      // After refinement, should have fewer or no overlaps
      expect(result.totalDisplacement).toBeGreaterThan(0);
    });

    it('should not move non-overlapping clusters', () => {
      // Create two well-separated clusters
      const clusters = [
        createCluster(0, [1, 0, 0], 0.1, 3),
        createCluster(1, [-1, 0, 0], 0.1, 3) // Opposite side of sphere
      ];

      // They should not overlap
      expect(hasClusterOverlaps(clusters)).toBe(false);

      const result = refineClusterPositions(clusters, DEFAULT_CONSTELLATION_CONFIG);

      expect(result.success).toBe(true);
      expect(result.remainingOverlaps).toBe(0);
      expect(result.iterations).toBe(0); // Should exit immediately
    });

    it('should keep clusters on unit sphere after refinement', () => {
      const clusters = [
        createCluster(0, [0, 0, 1], 0.3, 5),
        createCluster(1, [0.2, 0, 0.98], 0.3, 5)
      ];

      const result = refineClusterPositions(clusters, DEFAULT_CONSTELLATION_CONFIG);

      for (const cluster of result.clusters) {
        expect(cluster.center.length()).toBeCloseTo(1, 5);
      }
    });

    it('should report remaining overlaps if refinement fails', () => {
      // Create many overlapping clusters in a small area
      const clusters = Array.from({ length: 10 }, (_, i) => {
        const angle = (i * 0.1); // Small angular separation
        return createCluster(
          i,
          [Math.sin(angle), 0, Math.cos(angle)],
          0.5, // Large radius
          3
        );
      });

      const result = refineClusterPositions(clusters, {
        ...DEFAULT_CONSTELLATION_CONFIG,
        refinementIterations: 5 // Few iterations
      });

      // May still have some overlaps
      expect(result.iterations).toBeGreaterThan(0);
    });
  });

  describe('hasClusterOverlaps', () => {
    it('should return false for empty array', () => {
      expect(hasClusterOverlaps([])).toBe(false);
    });

    it('should return false for single cluster', () => {
      const clusters = [createCluster(0, [0, 0, 1], 0.3, 5)];
      expect(hasClusterOverlaps(clusters)).toBe(false);
    });

    it('should detect overlapping clusters', () => {
      const clusters = [
        createCluster(0, [0, 0, 1], 0.5, 5),
        createCluster(1, [0, 0.1, 0.995], 0.5, 5) // Very close
      ];

      expect(hasClusterOverlaps(clusters)).toBe(true);
    });

    it('should return false for well-separated clusters', () => {
      const clusters = [
        createCluster(0, [1, 0, 0], 0.1, 3),
        createCluster(1, [0, 1, 0], 0.1, 3),
        createCluster(2, [0, 0, 1], 0.1, 3)
      ];

      expect(hasClusterOverlaps(clusters)).toBe(false);
    });

    it('should respect margin parameter', () => {
      const clusters = [
        createCluster(0, [1, 0, 0], 0.1, 3),
        createCluster(1, [0, 1, 0], 0.1, 3)
      ];

      // Without margin
      expect(hasClusterOverlaps(clusters, 0)).toBe(false);

      // With large margin - should detect overlap
      expect(hasClusterOverlaps(clusters, Math.PI)).toBe(true);
    });
  });

  describe('findMinimumMargin', () => {
    it('should return 0 for non-overlapping clusters', () => {
      const clusters = [
        createCluster(0, [1, 0, 0], 0.1, 3),
        createCluster(1, [-1, 0, 0], 0.1, 3)
      ];

      expect(findMinimumMargin(clusters)).toBe(0);
    });

    it('should return positive value for overlapping clusters', () => {
      const clusters = [
        createCluster(0, [0, 0, 1], 0.5, 5),
        createCluster(1, [0, 0.1, 0.995], 0.5, 5)
      ];

      const margin = findMinimumMargin(clusters);
      expect(margin).toBeGreaterThan(0);
    });

    it('should handle single cluster', () => {
      const clusters = [createCluster(0, [0, 0, 1], 0.3, 5)];
      expect(findMinimumMargin(clusters)).toBe(0);
    });
  });

  describe('sortClustersBySize', () => {
    it('should sort clusters largest first', () => {
      const clusters = [
        createCluster(0, [1, 0, 0], 0.1, 3),
        createCluster(1, [0, 1, 0], 0.1, 10),
        createCluster(2, [0, 0, 1], 0.1, 5)
      ];

      const sorted = sortClustersBySize(clusters);

      expect(sorted[0].size).toBe(10);
      expect(sorted[1].size).toBe(5);
      expect(sorted[2].size).toBe(3);
    });

    it('should not modify original array', () => {
      const clusters = [
        createCluster(0, [1, 0, 0], 0.1, 3),
        createCluster(1, [0, 1, 0], 0.1, 10)
      ];

      const sorted = sortClustersBySize(clusters);

      expect(clusters[0].size).toBe(3); // Original unchanged
      expect(sorted).not.toBe(clusters); // Different array
    });

    it('should handle empty array', () => {
      expect(sortClustersBySize([])).toEqual([]);
    });

    it('should handle single cluster', () => {
      const clusters = [createCluster(0, [0, 0, 1], 0.3, 5)];
      const sorted = sortClustersBySize(clusters);

      expect(sorted).toHaveLength(1);
      expect(sorted[0].id).toBe(0);
    });
  });
});
