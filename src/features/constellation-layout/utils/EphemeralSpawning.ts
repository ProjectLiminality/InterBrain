/**
 * Ephemeral Node Spawning Utilities
 *
 * Calculates spawn positions for ephemeral nodes that are dynamically loaded
 * when needed by the orchestrator (e.g., for liminal web, search results).
 *
 * Ephemeral nodes spawn from a position radially outward from their target,
 * creating a "fly in from the distance" effect.
 */

/**
 * Calculate spawn position for an ephemeral node
 *
 * The spawn position is calculated by:
 * 1. Taking the target position (where the node will end up)
 * 2. Converting to cylindrical coordinates with camera depth as Z-axis
 * 3. Moving the spawn point radially outward (multiplying R)
 * 4. Setting Z to camera plane (0) so nodes appear to fly in from the distance
 *
 * @param targetPosition Where the node will animate to
 * @param spawnRadiusFactor How far out to spawn (multiplier on radial distance)
 * @returns Spawn position for the ephemeral node
 */
export function calculateSpawnPosition(
  targetPosition: [number, number, number],
  spawnRadiusFactor: number = 3
): [number, number, number] {
  const [x, y, z] = targetPosition;

  // Calculate radial distance from the Z-axis (camera depth axis)
  const r = Math.sqrt(x * x + y * y);

  // If node is near the Z-axis, spawn from a default offset
  if (r < 0.01) {
    // Node is directly in front of camera, spawn from above
    return [0, Math.abs(z) * spawnRadiusFactor, 0];
  }

  // Calculate polar angle in the XY plane
  const theta = Math.atan2(y, x);

  // Spawn at multiplied radial distance, at camera plane (z=0)
  const spawnR = r * spawnRadiusFactor;
  const spawnZ = 0; // Camera plane

  return [
    spawnR * Math.cos(theta),
    spawnR * Math.sin(theta),
    spawnZ
  ];
}

/**
 * Calculate exit position for an ephemeral node returning to nowhere
 *
 * Similar to spawn position but animates outward before unmounting.
 *
 * @param currentPosition Current position of the node
 * @param exitRadiusFactor How far out to animate before unmounting
 * @returns Exit position for the ephemeral node
 */
export function calculateExitPosition(
  currentPosition: [number, number, number],
  exitRadiusFactor: number = 3
): [number, number, number] {
  // Reuse spawn calculation logic - just animate in reverse
  return calculateSpawnPosition(currentPosition, exitRadiusFactor);
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
  spawnAnimationDuration: 800,
  exitAnimationDuration: 600,
  spawnEasing: 'easeOutQuart',
  exitEasing: 'easeInQuart'
};
