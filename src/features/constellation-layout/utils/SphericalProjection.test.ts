import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  getTangentBasis,
  exponentialMap,
  logarithmicMap,
  geodesicDistance,
  sphericalCapArea,
  areaToRadius,
  fibonacciSphere,
  sphericalCapsOverlap,
  scaleToSphere
} from './SphericalProjection';

describe('SphericalProjection', () => {
  describe('getTangentBasis', () => {
    it('should return orthonormal basis vectors', () => {
      const center = new Vector3(0, 0, 1).normalize();
      const { e1, e2 } = getTangentBasis(center);

      // e1 and e2 should be unit vectors
      expect(e1.length()).toBeCloseTo(1, 5);
      expect(e2.length()).toBeCloseTo(1, 5);

      // e1 and e2 should be orthogonal
      expect(e1.dot(e2)).toBeCloseTo(0, 5);

      // e1 and e2 should be perpendicular to center
      expect(e1.dot(center)).toBeCloseTo(0, 5);
      expect(e2.dot(center)).toBeCloseTo(0, 5);
    });

    it('should handle different center points', () => {
      const centers = [
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 0, -1),
        new Vector3(1, 1, 1).normalize()
      ];

      for (const center of centers) {
        const { e1, e2 } = getTangentBasis(center);

        expect(e1.length()).toBeCloseTo(1, 5);
        expect(e2.length()).toBeCloseTo(1, 5);
        expect(e1.dot(e2)).toBeCloseTo(0, 5);
        expect(e1.dot(center)).toBeCloseTo(0, 5);
        expect(e2.dot(center)).toBeCloseTo(0, 5);
      }
    });
  });

  describe('exponentialMap', () => {
    it('should return center point for zero tangent vector', () => {
      const center = new Vector3(0, 0, 1);
      const basis = getTangentBasis(center);

      const result = exponentialMap(center, { x: 0, y: 0 }, basis);

      expect(result.x).toBeCloseTo(center.x, 5);
      expect(result.y).toBeCloseTo(center.y, 5);
      expect(result.z).toBeCloseTo(center.z, 5);
    });

    it('should return point on unit sphere', () => {
      const center = new Vector3(0, 0, 1);
      const basis = getTangentBasis(center);

      const result = exponentialMap(center, { x: 0.5, y: 0.3 }, basis);

      expect(result.length()).toBeCloseTo(1, 5);
    });

    it('should move along great circle arc', () => {
      const center = new Vector3(0, 0, 1);
      const basis = getTangentBasis(center);

      // Moving π/2 radians should get us to the equator
      const result = exponentialMap(center, { x: Math.PI / 2, y: 0 }, basis);

      // Result should be on unit sphere
      expect(result.length()).toBeCloseTo(1, 5);

      // Z component should be close to 0 (on equator)
      expect(Math.abs(result.z)).toBeLessThan(0.1);
    });
  });

  describe('logarithmicMap', () => {
    it('should return zero for same point', () => {
      const center = new Vector3(0, 0, 1);
      const basis = getTangentBasis(center);

      const result = logarithmicMap(center, center.clone(), basis);

      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('should be inverse of exponentialMap', () => {
      const center = new Vector3(0, 0, 1);
      const basis = getTangentBasis(center);
      const originalTangent = { x: 0.3, y: 0.2 };

      const spherePoint = exponentialMap(center, originalTangent, basis);
      const recoveredTangent = logarithmicMap(center, spherePoint, basis);

      expect(recoveredTangent.x).toBeCloseTo(originalTangent.x, 4);
      expect(recoveredTangent.y).toBeCloseTo(originalTangent.y, 4);
    });
  });

  describe('geodesicDistance', () => {
    it('should return 0 for same point', () => {
      const p = new Vector3(1, 0, 0);
      expect(geodesicDistance(p, p.clone())).toBeCloseTo(0, 5);
    });

    it('should return π for antipodal points', () => {
      const p1 = new Vector3(0, 0, 1);
      const p2 = new Vector3(0, 0, -1);

      expect(geodesicDistance(p1, p2)).toBeCloseTo(Math.PI, 5);
    });

    it('should return π/2 for orthogonal points', () => {
      const p1 = new Vector3(1, 0, 0);
      const p2 = new Vector3(0, 1, 0);

      expect(geodesicDistance(p1, p2)).toBeCloseTo(Math.PI / 2, 5);
    });

    it('should be symmetric', () => {
      const p1 = new Vector3(1, 1, 0).normalize();
      const p2 = new Vector3(0, 1, 1).normalize();

      expect(geodesicDistance(p1, p2)).toBeCloseTo(geodesicDistance(p2, p1), 5);
    });
  });

  describe('sphericalCapArea', () => {
    it('should return 0 for zero radius', () => {
      expect(sphericalCapArea(0)).toBeCloseTo(0, 5);
    });

    it('should return 2π for hemisphere (radius π/2)', () => {
      expect(sphericalCapArea(Math.PI / 2)).toBeCloseTo(2 * Math.PI, 5);
    });

    it('should return 4π for full sphere (radius π)', () => {
      expect(sphericalCapArea(Math.PI)).toBeCloseTo(4 * Math.PI, 5);
    });
  });

  describe('areaToRadius', () => {
    it('should be inverse of sphericalCapArea', () => {
      const radii = [0.1, 0.5, 1.0, Math.PI / 2];

      for (const radius of radii) {
        const area = sphericalCapArea(radius);
        const recoveredRadius = areaToRadius(area);
        expect(recoveredRadius).toBeCloseTo(radius, 5);
      }
    });
  });

  describe('fibonacciSphere', () => {
    it('should generate requested number of points', () => {
      const points = fibonacciSphere(20);
      expect(points).toHaveLength(20);
    });

    it('should generate points on unit sphere', () => {
      const points = fibonacciSphere(50);

      for (const point of points) {
        expect(point.length()).toBeCloseTo(1, 5);
      }
    });

    it('should distribute points evenly (no clustering)', () => {
      const points = fibonacciSphere(100);

      // Calculate minimum distance between any two points
      let minDistance = Infinity;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const distance = geodesicDistance(points[i], points[j]);
          minDistance = Math.min(minDistance, distance);
        }
      }

      // With 100 points, minimum angular separation should be reasonable
      expect(minDistance).toBeGreaterThan(0.1);
    });

    it('should handle two points (minimum for valid distribution)', () => {
      const points = fibonacciSphere(2);
      expect(points).toHaveLength(2);
      // Both points should be on unit sphere
      expect(points[0].length()).toBeCloseTo(1, 5);
      expect(points[1].length()).toBeCloseTo(1, 5);
      // Points should be antipodal (opposite poles)
      const dot = points[0].dot(points[1]);
      expect(dot).toBeCloseTo(-1, 1); // Antipodal points have dot product -1
    });
  });

  describe('sphericalCapsOverlap', () => {
    it('should detect overlapping caps', () => {
      const center1 = new Vector3(0, 0, 1);
      const center2 = new Vector3(0.1, 0, 0.995).normalize();

      // Caps close together with large radii should overlap
      expect(sphericalCapsOverlap(center1, 0.5, center2, 0.5)).toBe(true);
    });

    it('should detect non-overlapping caps', () => {
      const center1 = new Vector3(1, 0, 0);
      const center2 = new Vector3(-1, 0, 0);

      // Caps on opposite sides with small radii should not overlap
      expect(sphericalCapsOverlap(center1, 0.1, center2, 0.1)).toBe(false);
    });

    it('should handle touching caps (boundary case)', () => {
      const center1 = new Vector3(0, 0, 1);
      const center2 = new Vector3(0, 1, 0);
      const distance = geodesicDistance(center1, center2); // π/2

      // Caps that exactly touch (sum of radii = distance)
      const radius = distance / 2;
      expect(sphericalCapsOverlap(center1, radius - 0.01, center2, radius - 0.01)).toBe(false);
      expect(sphericalCapsOverlap(center1, radius + 0.01, center2, radius + 0.01)).toBe(true);
    });
  });

  describe('scaleToSphere', () => {
    it('should scale unit vector to specified radius', () => {
      const unitPos = new Vector3(0, 0, 1);
      const result = scaleToSphere(unitPos, 5000);

      expect(result).toEqual([0, 0, 5000]);
    });

    it('should preserve direction', () => {
      const unitPos = new Vector3(1, 1, 1).normalize();
      const result = scaleToSphere(unitPos, 1000);

      const resultVec = new Vector3(...result);
      expect(resultVec.length()).toBeCloseTo(1000, 1);

      // Direction should be preserved
      const normalized = resultVec.clone().normalize();
      expect(normalized.x).toBeCloseTo(unitPos.x, 5);
      expect(normalized.y).toBeCloseTo(unitPos.y, 5);
      expect(normalized.z).toBeCloseTo(unitPos.z, 5);
    });
  });
});
