/**
 * Constellation Layout Constants
 * 
 * Single source of truth for constellation configuration defaults.
 */

export const CONSTELLATION_DEFAULTS = {
  /** Maximum nodes to mount in constellation view */
  MAX_NODES: 75,
  /** Whether to prioritize keeping clusters intact when filtering */
  PRIORITIZE_CLUSTERS: true,
} as const;
