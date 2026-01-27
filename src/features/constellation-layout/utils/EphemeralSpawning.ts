/**
 * Ephemeral Node Spawning Utilities
 *
 * Calculates spawn positions for ephemeral nodes that are dynamically loaded
 * when needed by the orchestrator (e.g., for liminal web, search results).
 *
 * Ephemeral nodes spawn from a fixed radius ring around the camera,
 * creating a "fly in from the distance" effect. Using a fixed radius
 * ensures all nodes travel similar distances for consistent visual effect.
 */

/** Fixed radius for spawn/exit ring (in world units) */
export const EPHEMERAL_SPAWN_RADIUS = 500;

/**
 * Calculate spawn position for an ephemeral node
 *
 * The spawn position is calculated by:
 * 1. Taking the target position (where the node will end up)
 * 2. Finding the direction from camera (origin) to target in XY plane
 * 3. Placing spawn point at fixed radius in that direction
 * 4. Setting Z to camera plane (0) so nodes appear to fly in from the edge
 *
 * @param targetPosition Where the node will animate to
 * @param _spawnRadiusFactor Deprecated - now uses fixed EPHEMERAL_SPAWN_RADIUS
 * @returns Spawn position for the ephemeral node
 */
export function calculateSpawnPosition(
  targetPosition: [number, number, number],
  _spawnRadiusFactor: number = 3,
  isCenterNode: boolean = false
): [number, number, number] {
  // Center node spawns from above (positive Y direction)
  if (isCenterNode) {
    return [0, EPHEMERAL_SPAWN_RADIUS, 0];
  }

  const [x, y] = targetPosition;

  // Calculate polar angle in the XY plane (direction from camera to target)
  const theta = Math.atan2(y, x);

  // Spawn at fixed radius in the same angular direction, at camera plane (z=0)
  return [
    EPHEMERAL_SPAWN_RADIUS * Math.cos(theta),
    EPHEMERAL_SPAWN_RADIUS * Math.sin(theta),
    0
  ];
}

/**
 * Calculate exit position for an ephemeral node returning to nowhere
 *
 * Calculates exit position at fixed radius in the direction from camera to node.
 * Uses the same fixed radius as spawn for visual consistency.
 *
 * @param currentPosition Current position of the node
 * @param _exitRadiusFactor Deprecated - now uses fixed EPHEMERAL_SPAWN_RADIUS
 * @returns Exit position for the ephemeral node
 */
export function calculateExitPosition(
  currentPosition: [number, number, number],
  _exitRadiusFactor: number = 3,
  isCenterNode: boolean = false
): [number, number, number] {
  // Center node exits upward (positive Y direction)
  if (isCenterNode) {
    return [0, EPHEMERAL_SPAWN_RADIUS, 0];
  }

  const [x, y] = currentPosition;

  // Calculate polar angle in the XY plane (direction from camera to node)
  const theta = Math.atan2(y, x);

  // Exit at fixed radius in the same angular direction, at camera plane (z=0)
  return [
    EPHEMERAL_SPAWN_RADIUS * Math.cos(theta),
    EPHEMERAL_SPAWN_RADIUS * Math.sin(theta),
    0
  ];
}

/**
 * Calculate a random spawn position on the sphere edge
 *
 * For nodes that don't have a specific target yet, spawn them
 * from a random point at the edge of the visible sphere.
 *
 * @param sphereRadius The radius of the constellation sphere
 * @returns Random spawn position at sphere edge
 */
export function calculateRandomSpawnPosition(
  sphereRadius: number = 5000
): [number, number, number] {
  // Random angle in XY plane
  const theta = Math.random() * Math.PI * 2;

  // Spawn at sphere edge, slightly in front of camera
  const spawnZ = -sphereRadius * 0.3; // 30% depth into the sphere
  const spawnR = sphereRadius;

  return [
    spawnR * Math.cos(theta),
    spawnR * Math.sin(theta),
    spawnZ
  ];
}

/**
 * Configuration for ephemeral spawning behavior
 */
export interface EphemeralSpawnConfig {
  /** Multiplier for radial spawn distance */
  spawnRadiusFactor: number;
  /** Multiplier for radial exit distance */
  exitRadiusFactor: number;
  /** Duration of spawn animation in ms */
  spawnAnimationDuration: number;
  /** Duration of exit animation in ms */
  exitAnimationDuration: number;
  /** Easing function for spawn animation */
  spawnEasing: string;
  /** Easing function for exit animation */
  exitEasing: string;
}

/**
 * Default configuration for ephemeral spawning
 */
export const DEFAULT_EPHEMERAL_SPAWN_CONFIG: EphemeralSpawnConfig = {
  spawnRadiusFactor: 3,
  exitRadiusFactor: 3,
  spawnAnimationDuration: 1000,  // Canonical 1s heartbeat
  exitAnimationDuration: 1000,   // Canonical 1s heartbeat
  spawnEasing: 'easeInOutQuart',
  exitEasing: 'easeInQuart'
};
