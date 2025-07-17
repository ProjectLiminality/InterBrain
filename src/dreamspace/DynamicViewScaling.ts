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
  innerRadius: 1500,  // Center plateau - 30% of sphere radius
  outerRadius: 3000,  // Scaling zone boundary - 60% of sphere radius
  intersectionPoint: CAMERA_INTERSECTION_POINT,
  minDistance: 1000,  // Closest nodes can get to camera
  maxDistance: 4000   // Farthest nodes can get from camera
};


/**
 * Calculate radial distance based on 3D distance from intersection point
 * 
 * Maps actual 3D distance to radial offset using smooth curve for
 * natural Apple Watch-style scaling.
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
  
  // Scaling zone - smooth interpolation between min and max distance
  const scalingProgress = (distance3D - innerRadius) / (outerRadius - innerRadius);
  
  // Apply smooth curve (ease-in-out)
  const smoothProgress = smoothstep(scalingProgress);
  
  return minDistance + (maxDistance - minDistance) * smoothProgress;
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
 * Determine render mode based on 3D distance from intersection point
 */
export function getRenderMode(
  distance3D: number,
  config: DynamicViewScalingConfig
): 'dreamnode' | 'star' {
  return distance3D <= config.outerRadius ? 'dreamnode' : 'star';
}

/**
 * Calculate radial offset for DreamNode based on dynamic scaling
 * 
 * Returns offset distance from anchor point (toward camera) and render mode.
 * Anchor point stays at original Fibonacci sphere position.
 */
export function calculateDynamicScaling(
  anchorPosition: Vector3,
  config: DynamicViewScalingConfig
): { radialOffset: number; renderMode: 'dreamnode' | 'star' } {
  // Calculate simple 3D distance from anchor to intersection point
  const distance3D = anchorPosition.distanceTo(config.intersectionPoint);
  
  // Determine render mode based on 3D distance
  const renderMode = getRenderMode(distance3D, config);
  
  // Calculate radial distance for this node
  const radialDistance = calculateRadialDistance(distance3D, config);
  
  // Calculate radial offset from anchor point
  // Anchor is at sphereRadius distance, we want to move it to radialDistance
  const radialOffset = config.sphereRadius - radialDistance;
  
  // Debug logging
  if (Math.random() < 0.05) { // Log ~5% of calculations
    console.log('Dynamic Scaling Debug:', {
      anchor: [anchorPosition.x, anchorPosition.y, anchorPosition.z],
      intersection: [config.intersectionPoint.x, config.intersectionPoint.y, config.intersectionPoint.z],
      distance3D: Math.round(distance3D),
      radialDistance: Math.round(radialDistance),
      radialOffset: Math.round(radialOffset),
      renderMode
    });
  }
  
  return {
    radialOffset,
    renderMode
  };
}