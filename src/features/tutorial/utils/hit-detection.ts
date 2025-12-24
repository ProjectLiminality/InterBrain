/**
 * Hit Detection Utilities for Tutorial Elements
 *
 * Uses raycasting to detect when a 3D position intersects with node hit spheres.
 * This allows the golden dot to trigger hover effects when it visually overlaps nodes.
 */

import { Vector3, Raycaster, Mesh, Camera } from 'three';
import { serviceManager } from '../../../core/services/service-manager';

// Camera FOV constant (matching drop-handlers.ts)
const CAMERA_FOV_RAD = (75 * Math.PI) / 180;

/**
 * Check if a 3D position visually intersects with a node's hit sphere.
 * Projects the position to screen coordinates and raycasts from camera.
 *
 * @param position - The 3D position to check [x, y, z]
 * @param nodeIds - Array of node IDs to check against
 * @param camera - The Three.js camera for projection
 * @returns The ID of the first intersected node, or null if no intersection
 */
export function checkHitSphereIntersection(
  position: [number, number, number],
  nodeIds: string[],
  camera: Camera
): string | null {
  // Get hit sphere meshes for the specified nodes
  const hitSpheres: Mesh[] = [];
  const nodeIdByMesh = new Map<Mesh, string>();

  for (const nodeId of nodeIds) {
    const hitSphere = serviceManager.getHitSphere(nodeId);
    if (hitSphere) {
      hitSpheres.push(hitSphere);
      nodeIdByMesh.set(hitSphere, nodeId);
    }
  }

  if (hitSpheres.length === 0) {
    return null;
  }

  // Get canvas element for coordinate conversion
  const canvasElement = globalThis.document.querySelector(
    '.dreamspace-canvas-container canvas'
  ) as globalThis.HTMLCanvasElement;

  if (!canvasElement) {
    return null;
  }

  const rect = canvasElement.getBoundingClientRect();

  // Project 3D position to screen coordinates
  const pos3D = new Vector3(position[0], position[1], position[2]);
  const projected = pos3D.clone().project(camera);

  // Convert from NDC (-1 to 1) to screen coordinates
  // Note: We don't actually need screen coords, we use NDC directly for raycasting
  const ndcX = projected.x;
  const ndcY = projected.y;

  // Calculate ray direction with perspective projection (matching drop-handlers.ts)
  const aspect = rect.width / rect.height;
  const tanHalfFov = Math.tan(CAMERA_FOV_RAD / 2);

  const rayDirection = new Vector3(
    ndcX * tanHalfFov * aspect,
    ndcY * tanHalfFov,
    -1
  ).normalize();

  // Create raycaster from camera origin along the ray direction
  const raycaster = new Raycaster();
  raycaster.set(new Vector3(0, 0, 0), rayDirection);

  // Check intersections with hit spheres
  const intersections = raycaster.intersectObjects(hitSpheres);

  if (intersections.length > 0) {
    const hitMesh = intersections[0].object as Mesh;
    return nodeIdByMesh.get(hitMesh) ?? null;
  }

  return null;
}

/**
 * Hook-style interface for continuous hit detection during animation.
 * Returns functions to start/stop tracking and get current intersection state.
 */
export interface HitDetectionState {
  /** Currently intersected node ID, or null */
  intersectedNodeId: string | null;
  /** Whether the dot is currently inside a hit sphere */
  isIntersecting: boolean;
}

/**
 * Create a hit detection tracker for use in animation frames.
 * Call update() each frame with the current position.
 */
export function createHitDetectionTracker(nodeIds: string[]) {
  let lastIntersectedId: string | null = null;

  return {
    /**
     * Update hit detection with current position.
     * @returns Object with intersection state and change flags
     */
    update(
      position: [number, number, number],
      camera: Camera
    ): {
      intersectedNodeId: string | null;
      didEnter: string | null;  // Node ID if just entered
      didExit: string | null;   // Node ID if just exited
    } {
      const currentIntersectedId = checkHitSphereIntersection(position, nodeIds, camera);

      const didEnter = currentIntersectedId && currentIntersectedId !== lastIntersectedId
        ? currentIntersectedId
        : null;
      const didExit = lastIntersectedId && lastIntersectedId !== currentIntersectedId
        ? lastIntersectedId
        : null;

      lastIntersectedId = currentIntersectedId;

      return {
        intersectedNodeId: currentIntersectedId,
        didEnter,
        didExit,
      };
    },

    /**
     * Reset the tracker state
     */
    reset() {
      lastIntersectedId = null;
    },

    /**
     * Get current intersection state without updating
     */
    getCurrentState(): string | null {
      return lastIntersectedId;
    }
  };
}
