/**
 * Dynamic View Scaling System
 * 
 * Apple Watch-style distance-based scaling for DreamNodes in 3D night sky.
 * Uses distance-based positioning instead of CSS scaling to avoid styling complications.
 */

import { Vector3 } from 'three';

/**
 * Configuration for dynamic view scaling system
 */
export interface DynamicViewScalingConfig {
  /** Radius of the night sky sphere */
  sphereRadius: number;
  /** Inner radius - nodes at maximum size (center plateau) */
  innerRadius: number;
  /** Outer radius - transition to star representation */
  outerRadius: number;
  /** Intersection point where camera view axis meets sphere */
  intersectionPoint: Vector3;
  /** Minimum distance from camera (closest nodes can get) */
  minDistance: number;
  /** Maximum distance from camera (farthest nodes can get) */
  maxDistance: number;
}

/**
 * CONSTANT INTERSECTION POINT
 * 
 * Since we use a static camera approach, the intersection point where the camera
 * view axis meets the sphere is constant and never changes. This point serves as
 * the reference for all distance calculations.
 * 
 * Camera is at origin [0,0,0] looking along NEGATIVE Z axis (Three.js default).
 * Intersection point is at [0,0,-sphereRadius] on the sphere surface.
 */
export const NIGHT_SKY_SPHERE_RADIUS = 5000; // Reduced for better proportions

export const CAMERA_INTERSECTION_POINT = new Vector3(0, 0, -NIGHT_SKY_SPHERE_RADIUS);

/**
 * Default configuration for dynamic view scaling
 * 
 * Apple Watch-style scaling zones:
 * - Inner radius: Center plateau where nodes appear at maximum size
 * - Outer radius: Boundary where nodes transition to stars
 * - Beyond outer: Stars only (performance optimization)
 */
export const DEFAULT_SCALING_CONFIG: DynamicViewScalingConfig = {
  sphereRadius: NIGHT_SKY_SPHERE_RADIUS,
  innerRadius: 750,   // Center plateau - 15% of sphere radius (half the previous size)
  outerRadius: 2250,  // Scaling zone boundary - 45% of sphere radius (75% of previous)
  intersectionPoint: CAMERA_INTERSECTION_POINT,
  minDistance: 75,    // Closest to camera - slightly farther for better UX
  maxDistance: NIGHT_SKY_SPHERE_RADIUS  // Stars exactly on sphere surface
};


/**
 * Calculate radial distance based on 3D distance from intersection point
 * 
 * Maps actual 3D distance to radial offset using perspective-corrected scaling
 * for linear perceived size changes (compensates for 1/distance perspective effect).
 */
export function calculateRadialDistance(
  distance3D: number,
  config: DynamicViewScalingConfig
): number {
  const { innerRadius, outerRadius, minDistance, maxDistance } = config;
  
  if (distance3D <= innerRadius) {
    // Inner plateau - all nodes at minimum distance (maximum size)
    return minDistance;
  }
  
  if (distance3D >= outerRadius) {
    // Outer zone - all nodes at maximum distance (star representation)
    return maxDistance;
  }
  
  // Scaling zone - perspective-corrected interpolation for linear perceived scaling
  // Fix: progress should be 0 at outerRadius (far/small) and 1 at innerRadius (close/large)
  const scalingProgress = (outerRadius - distance3D) / (outerRadius - innerRadius);
  
  // Apply smooth curve (ease-in-out) to the progress
  const smoothProgress = smoothstep(scalingProgress);
  
  // Perspective correction: compensate for 1/distance scaling
  // For linear perceived scaling, we need to adjust the distance non-linearly
  const minInverse = 1 / minDistance;
  const maxInverse = 1 / maxDistance;
  
  // Linear interpolation in "apparent size space" (1/distance)
  // smoothProgress=0 (outerRadius) → maxDistance (small/far)
  // smoothProgress=1 (innerRadius) → minDistance (large/close)
  const targetInverse = maxInverse + smoothProgress * (minInverse - maxInverse);
  
  // Convert back to distance
  return 1 / targetInverse;
}

/**
 * Smooth step function for natural scaling curves
 * Implements 3x^2 - 2x^3 for ease-in-out behavior
 */
function smoothstep(t: number): number {
  const clampedT = Math.max(0, Math.min(1, t));
  return clampedT * clampedT * (3 - 2 * clampedT);
}


/**
 * Calculate radial offset for DreamNode based on dynamic scaling
 * 
 * Returns offset distance from anchor point (toward camera).
 * Anchor point stays at original Fibonacci sphere position.
 */
export function calculateDynamicScaling(
  anchorPosition: Vector3,
  config: DynamicViewScalingConfig
): { radialOffset: number } {
  // Calculate simple 3D distance from anchor to intersection point
  const distance3D = anchorPosition.distanceTo(config.intersectionPoint);
  
  // Calculate radial distance for this node
  const radialDistance = calculateRadialDistance(distance3D, config);
  
  // Calculate radial offset from anchor point
  // Anchor is at sphereRadius distance, we want to move it to radialDistance
  // Negative offset moves toward camera (origin), positive moves away
  const radialOffset = radialDistance - config.sphereRadius;
  
  return {
    radialOffset
  };
}

