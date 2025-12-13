/**
 * Spherical Projection Utilities
 *
 * Mathematical functions for projecting between 2D tangent planes and 3D sphere surface.
 * Implements exponential map and related geometric operations from the HTML prototype.
 */

import { Vector3 } from 'three';
import { TangentBasis, PlanarPosition } from '../LayoutConfig';

/**
 * Compute orthonormal tangent basis at a point on the unit sphere
 *
 * Creates two orthogonal tangent vectors at the given sphere point,
 * forming a coordinate system for 2D layout in the tangent plane.
 *
 * @param center Point on unit sphere where tangent plane is centered
 * @returns Orthonormal basis vectors e1 and e2
 */
export function getTangentBasis(center: Vector3): TangentBasis {
  // Choose an initial vector that's not parallel to center
  let u = new Vector3(1, 0, 0);
  if (Math.abs(center.dot(u)) > 0.9) {
    u = new Vector3(0, 1, 0);
  }

  // Project u onto tangent space and normalize
  const e1 = u.clone()
    .sub(center.clone().multiplyScalar(u.dot(center)))
    .normalize();

  // Second basis vector is cross product
  const e2 = center.clone().cross(e1).normalize();

  return { e1, e2 };
}

/**
 * Exponential map from tangent plane to sphere surface
 *
 * Projects a 2D vector in the tangent plane to a 3D point on the sphere surface.
 * This is the key operation that maps force-directed layouts onto curved space.
 *
 * Mathematical formula:
 * exp_p(v) = cos(|v|) * p + sin(|v|) * (v / |v|)
 * where p is the center point and v is the tangent vector
 *
 * @param center Center point on unit sphere
 * @param tangentVector 2D vector in tangent plane at center
 * @param basis Tangent plane basis vectors
 * @returns Point on unit sphere surface
 */
export function exponentialMap(center: Vector3, tangentVector: PlanarPosition, basis: TangentBasis): Vector3 {
  // Convert 2D tangent vector to 3D tangent vector
  const tangent3D = basis.e1.clone()
    .multiplyScalar(tangentVector.x)
    .add(basis.e2.clone().multiplyScalar(tangentVector.y));

  const theta = tangent3D.length();

  // Handle the case where tangent vector is zero
  if (theta < 1e-10) {
    return center.clone();
  }

  // Apply exponential map formula
  const result = center.clone().multiplyScalar(Math.cos(theta));
  const normalizedTangent = tangent3D.clone().divideScalar(theta);
  result.add(normalizedTangent.multiplyScalar(Math.sin(theta)));

  return result.normalize();
}

/**
 * Logarithmic map from sphere surface to tangent plane
 *
 * Inverse of exponential map - projects a point on the sphere
 * to a 2D vector in the tangent plane at the given center.
 *
 * @param center Center point on unit sphere
 * @param point Point on unit sphere to project
 * @param basis Tangent plane basis vectors
 * @returns 2D vector in tangent plane
 */
export function logarithmicMap(center: Vector3, point: Vector3, basis: TangentBasis): PlanarPosition {
  const dotProduct = center.dot(point);

  // Points are the same
  if (Math.abs(dotProduct - 1.0) < 1e-10) {
    return { x: 0, y: 0 };
  }

  // Handle antipodal points
  if (Math.abs(dotProduct + 1.0) < 1e-10) {
    // Return a point at distance π in arbitrary direction
    return { x: Math.PI, y: 0 };
  }

  const theta = Math.acos(Math.max(-1, Math.min(1, dotProduct)));

  if (theta < 1e-10) {
    return { x: 0, y: 0 };
  }

  // Project point minus center onto tangent space
  const tangentVector = point.clone().sub(center.clone().multiplyScalar(dotProduct));
  tangentVector.multiplyScalar(theta / tangentVector.length());

  // Convert 3D tangent vector to 2D coordinates
  const x = tangentVector.dot(basis.e1);
  const y = tangentVector.dot(basis.e2);

  return { x, y };
}

/**
 * Calculate geodesic distance between two points on unit sphere
 *
 * @param p1 First point on unit sphere
 * @param p2 Second point on unit sphere
 * @returns Angular distance in radians
 */
export function geodesicDistance(p1: Vector3, p2: Vector3): number {
  const dotProduct = Math.max(-1, Math.min(1, p1.dot(p2)));
  return Math.acos(dotProduct);
}

/**
 * Calculate spherical cap area for a given angular radius
 *
 * Formula: A = 2π(1 - cos(θ)) where θ is the angular radius
 *
 * @param angularRadius Radius in radians
 * @returns Area of spherical cap
 */
export function sphericalCapArea(angularRadius: number): number {
  return 2 * Math.PI * (1 - Math.cos(angularRadius));
}

/**
 * Convert spherical cap area to angular radius
 *
 * Inverse of sphericalCapArea function
 *
 * @param area Area of spherical cap
 * @returns Angular radius in radians
 */
export function areaToRadius(area: number): number {
  return Math.acos(1 - area / (2 * Math.PI));
}

/**
 * Generate Fibonacci sphere points for cluster centers
 *
 * Distributes n points evenly on a unit sphere using the golden ratio.
 * This is the same algorithm used in the existing FibonacciSphereLayout.
 *
 * @param n Number of points to generate
 * @returns Array of points on unit sphere
 */
export function fibonacciSphere(n: number): Vector3[] {
  const points: Vector3[] = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i) / (n - 1);
    const radius = Math.sqrt(1 - y * y);
    const theta = 2 * Math.PI * i / goldenRatio;

    // Generate point in standard Fibonacci distribution
    const point = new Vector3(
      radius * Math.cos(theta),
      y,
      radius * Math.sin(theta)
    );

    // Apply 90-degree rotation around X-axis to move north pole to forward-facing equator
    // Rotation matrix: [1, 0, 0; 0, cos(-π/2), -sin(-π/2); 0, sin(-π/2), cos(-π/2)]
    // Simplified: [1, 0, 0; 0, 0, 1; 0, -1, 0]
    // This transforms: (x, y, z) → (x, z, -y)
    const rotatedPoint = new Vector3(
      point.x,      // x unchanged
      point.z,      // y = z (forward-facing)
      -point.y      // z = -y (moves north pole forward)
    );

    points.push(rotatedPoint);
  }

  return points;
}

/**
 * Check if two spherical caps overlap
 *
 * @param center1 Center of first cap
 * @param radius1 Angular radius of first cap (radians)
 * @param center2 Center of second cap
 * @param radius2 Angular radius of second cap (radians)
 * @returns True if caps overlap
 */
export function sphericalCapsOverlap(
  center1: Vector3,
  radius1: number,
  center2: Vector3,
  radius2: number
): boolean {
  const distance = geodesicDistance(center1, center2);
  return distance < (radius1 + radius2);
}

/**
 * Scale a sphere position to the desired radius
 *
 * @param unitPosition Position on unit sphere
 * @param radius Desired sphere radius
 * @returns Scaled position
 */
export function scaleToSphere(unitPosition: Vector3, radius: number): [number, number, number] {
  const scaled = unitPosition.clone().multiplyScalar(radius);
  return [scaled.x, scaled.y, scaled.z];
}