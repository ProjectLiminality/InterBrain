import { describe, it, expect } from 'vitest';
import { 
  calculateFibonacciSpherePositions, 
  getFibonacciSpherePosition,
  validateFibonacciConfig,
  DEFAULT_FIBONACCI_CONFIG,
  type FibonacciSphereConfig 
} from './FibonacciSphereLayout';

describe('FibonacciSphereLayout', () => {
  describe('calculateFibonacciSpherePositions', () => {
    it('should generate correct number of positions', () => {
      const config: FibonacciSphereConfig = {
        radius: 1000,
        nodeCount: 12,
        center: [0, 0, 0]
      };
      
      const positions = calculateFibonacciSpherePositions(config);
      expect(positions).toHaveLength(12);
    });

    it('should place all nodes on sphere surface (within tolerance)', () => {
      const config: FibonacciSphereConfig = {
        radius: 1000,
        nodeCount: 20,
        center: [0, 0, 0]
      };
      
      const positions = calculateFibonacciSpherePositions(config);
      
      positions.forEach((pos) => {
        const [x, y, z] = pos.position;
        const distance = Math.sqrt(x * x + y * y + z * z);
        expect(distance).toBeCloseTo(1000, 1); // Within 0.1 tolerance
      });
    });

    it('should apply center offset correctly', () => {
      const config: FibonacciSphereConfig = {
        radius: 500,
        nodeCount: 6,
        center: [100, -200, 300]
      };
      
      const positions = calculateFibonacciSpherePositions(config);
      
      positions.forEach((pos) => {
        const [x, y, z] = pos.position;
        const centeredX = x - 100;
        const centeredY = y + 200;
        const centeredZ = z - 300;
        const distance = Math.sqrt(centeredX * centeredX + centeredY * centeredY + centeredZ * centeredZ);
        expect(distance).toBeCloseTo(500, 1);
      });
    });

    it('should generate unique positions (no duplicates)', () => {
      const config: FibonacciSphereConfig = {
        radius: 1000,
        nodeCount: 50,
        center: [0, 0, 0]
      };
      
      const positions = calculateFibonacciSpherePositions(config);
      const positionStrings = positions.map(p => p.position.join(','));
      const uniquePositions = new Set(positionStrings);
      
      expect(uniquePositions.size).toBe(50);
    });

    it('should maintain consistent index mapping', () => {
      const config: FibonacciSphereConfig = {
        radius: 1000,
        nodeCount: 15,
        center: [0, 0, 0]
      };
      
      const positions = calculateFibonacciSpherePositions(config);
      
      positions.forEach((pos, arrayIndex) => {
        expect(pos.index).toBe(arrayIndex);
      });
    });
  });

  describe('getFibonacciSpherePosition', () => {
    it('should generate same position as bulk calculation for given index', () => {
      const config: FibonacciSphereConfig = {
        radius: 1000,
        nodeCount: 20,
        center: [0, 0, 0]
      };
      
      const bulkPositions = calculateFibonacciSpherePositions(config);
      const singlePosition = getFibonacciSpherePosition(5, config);
      
      expect(singlePosition.position).toEqual(bulkPositions[5].position);
      expect(singlePosition.index).toBe(5);
    });

    it('should handle boundary indices correctly', () => {
      const config: FibonacciSphereConfig = {
        radius: 500,
        nodeCount: 10,
        center: [0, 0, 0]
      };
      
      // Test first and last indices
      const firstPos = getFibonacciSpherePosition(0, config);
      const lastPos = getFibonacciSpherePosition(9, config);
      
      expect(firstPos.index).toBe(0);
      expect(lastPos.index).toBe(9);
      
      // Verify they're on the sphere
      const [x1, y1, z1] = firstPos.position;
      const [x2, y2, z2] = lastPos.position;
      
      expect(Math.sqrt(x1*x1 + y1*y1 + z1*z1)).toBeCloseTo(500, 1);
      expect(Math.sqrt(x2*x2 + y2*y2 + z2*z2)).toBeCloseTo(500, 1);
    });
  });

  describe('validateFibonacciConfig', () => {
    it('should validate correct configurations', () => {
      const validConfigs: FibonacciSphereConfig[] = [
        { radius: 1000, nodeCount: 12, center: [0, 0, 0] },
        { radius: 500, nodeCount: 50 },
        { radius: 2000, nodeCount: 1, center: [100, -200, 300] }
      ];
      
      validConfigs.forEach(config => {
        expect(validateFibonacciConfig(config)).toBe(true);
      });
    });

    it('should reject invalid configurations', () => {
      const invalidConfigs = [
        { radius: 0, nodeCount: 12 },        // Zero radius
        { radius: -500, nodeCount: 12 },     // Negative radius
        { radius: 1000, nodeCount: 0 },      // Zero node count
        { radius: 1000, nodeCount: -5 },     // Negative node count
        { radius: Infinity, nodeCount: 12 }, // Infinite radius
        { radius: 1000, nodeCount: 12.5 },   // Non-integer node count
        { radius: 1000, nodeCount: 12, center: [1, 2] } // Invalid center format
      ];
      
      invalidConfigs.forEach(config => {
        expect(validateFibonacciConfig(config as FibonacciSphereConfig)).toBe(false);
      });
    });
  });

  describe('DEFAULT_FIBONACCI_CONFIG', () => {
    it('should be valid configuration', () => {
      expect(validateFibonacciConfig(DEFAULT_FIBONACCI_CONFIG)).toBe(true);
    });

    it('should match expected default values', () => {
      expect(DEFAULT_FIBONACCI_CONFIG.radius).toBe(5000); // Updated for night sky scaling
      expect(DEFAULT_FIBONACCI_CONFIG.nodeCount).toBe(12);
      expect(DEFAULT_FIBONACCI_CONFIG.center).toEqual([0, 0, 0]);
    });
  });

  describe('Mathematical accuracy', () => {
    it('should distribute nodes evenly (no clustering)', () => {
      const config: FibonacciSphereConfig = {
        radius: 1000,
        nodeCount: 100,
        center: [0, 0, 0]
      };
      
      const positions = calculateFibonacciSpherePositions(config);
      
      // Calculate minimum distance between any two nodes
      let minDistance = Infinity;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const [x1, y1, z1] = positions[i].position;
          const [x2, y2, z2] = positions[j].position;
          const distance = Math.sqrt(
            (x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2
          );
          minDistance = Math.min(minDistance, distance);
        }
      }
      
      // With 100 nodes on a sphere of radius 1000, minimum distance should be reasonable
      // This tests that nodes aren't clustered together
      expect(minDistance).toBeGreaterThan(100); // Reasonable minimum separation
    });

    it('should use golden ratio for spiral distribution', () => {
      const config: FibonacciSphereConfig = {
        radius: 1000,
        nodeCount: 21, // Fibonacci number for better mathematical properties
        center: [0, 0, 0]
      };
      
      const positions = calculateFibonacciSpherePositions(config);
      
      // Verify that the algorithm produces expected distribution
      // We check that nodes are spread across different latitude bands
      const latitudes = positions.map(pos => {
        const [, , z] = pos.normalized;
        return Math.acos(z); // Latitude in spherical coordinates
      });
      
      // Sort latitudes to check distribution
      latitudes.sort((a, b) => a - b);
      
      // Check that latitudes are reasonably spread (not clustered)
      const latRange = latitudes[latitudes.length - 1] - latitudes[0];
      expect(latRange).toBeGreaterThan(Math.PI * 0.8); // Should span majority of the sphere
    });
  });

  describe('Performance considerations', () => {
    it('should handle large node counts efficiently', () => {
      const startTime = Date.now();
      
      const config: FibonacciSphereConfig = {
        radius: 1000,
        nodeCount: 1000, // Large number for performance test
        center: [0, 0, 0]
      };
      
      const positions = calculateFibonacciSpherePositions(config);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(positions).toHaveLength(1000);
      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });
  });
});