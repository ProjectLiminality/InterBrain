/**
 * Orchestration Types
 *
 * Core types for the unified orchestration architecture.
 * These types establish a simplified model where nodes have a single target state
 * and the orchestrator computes layout intents that are dispatched to nodes.
 */

import { SpatialLayoutMode } from '../store/interbrain-store';

/**
 * The unified target state for any DreamNode.
 *
 * A node either:
 * - Has an explicit 'active' position (participating in current layout)
 * - Is in 'home' mode (node determines what home means: constellation for persistent, despawn for ephemeral)
 *
 * Key principles:
 * - Always interpolate from current state to target state
 * - No instant transitions - everything animates
 * - 'home' abstracts away ephemeral vs persistent behavior
 * - Flip and position are unified in one target (both animate together)
 */
export type NodeTargetState =
  | {
      mode: 'active';
      position: [number, number, number];
      flipSide: 'front' | 'back';
    }
  | {
      mode: 'home';
    };

/**
 * What the orchestrator computes as the desired layout.
 *
 * This is a pure data structure representing the layout intent.
 * The orchestrator then translates this into NodeTargetState for each node.
 *
 * Key principles:
 * - center is null for constellation/search-only layouts
 * - surroundingNodes is an ordered list - ring positions are computed automatically
 * - Everything not explicitly listed goes 'home'
 */
export interface LayoutIntent {
  /** The node to place at center (null for constellation view) */
  center: {
    nodeId: string;
    flipSide: 'front' | 'back';
  } | null;

  /** Ordered list of node IDs for ring placement (order determines ring position) */
  surroundingNodes: string[];
}

/**
 * Context needed to derive layout intents.
 *
 * This captures the relevant state needed by intent derivation functions
 * to determine what layout should be computed.
 */
export interface LayoutContext {
  /** Currently centered node (if any) */
  currentCenter: string | null;

  /** Current center node's flip side (if centered) */
  currentCenterFlipSide: 'front' | 'back' | null;

  /** Current spatial layout mode */
  layoutMode: SpatialLayoutMode;

  /** Whether we're in holarchy mode (center is flipped to back, showing supermodules) */
  isHolarchyMode: boolean;
}

/**
 * Result of deriving an intent, including any nodes that need special handling.
 */
export interface DerivedIntentResult {
  /** The computed layout intent */
  intent: LayoutIntent;

  /** Nodes that should animate to home (previous layout participants not in new layout) */
  nodesToSendHome: string[];

  /** Whether this is a holarchy navigation (switching between flipped nodes) */
  isHolarchyNavigation: boolean;
}

/**
 * Options for executing a layout intent.
 */
export interface ExecuteLayoutOptions {
  /** Animation duration in milliseconds */
  duration?: number;

  /** Easing function name */
  easing?: 'easeOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart';

  /** Whether to skip animation (instant transition) */
  instant?: boolean;
}

/**
 * Snapshot of a layout state for instant restoration on reload.
 *
 * Key principles:
 * - Captures the OUTCOME of layout transitions (final positions), not minimal state
 * - Only taken at quantized transition boundaries (not per-frame updates)
 * - Enables instant mount without animation or re-derivation
 * - Does NOT include: dynamic view scaling offsets, in-flight animation state
 */
export interface LayoutSnapshot {
  /** The quantized layout state */
  layoutState: SpatialLayoutMode;

  /** Final computed positions for all active nodes */
  activeNodes: {
    [nodeId: string]: {
      position: [number, number, number];
      flipSide: 'front' | 'back';
    };
  };

  /** Sphere rotation at transition time (quaternion as array for serialization) */
  sphereRotation: { x: number; y: number; z: number; w: number };

  /** Center node ID (for liminal-web, holarchy, copilot) */
  centerId: string | null;

  /** Ring node assignments for quick lookup */
  ringAssignments: {
    ring1NodeIds: string[];
    ring2NodeIds: string[];
    ring3NodeIds: string[];
  };

  /** Timestamp for cache invalidation and debugging */
  timestamp: number;

  /** Version for migration if snapshot structure changes */
  version: number;
}

/** Current snapshot version - increment when structure changes */
export const LAYOUT_SNAPSHOT_VERSION = 1;

/**
 * Creates an empty/default snapshot representing constellation mode.
 */
export function createDefaultSnapshot(): LayoutSnapshot {
  return {
    layoutState: 'constellation',
    activeNodes: {},
    sphereRotation: { x: 0, y: 0, z: 0, w: 1 }, // Identity quaternion
    centerId: null,
    ringAssignments: {
      ring1NodeIds: [],
      ring2NodeIds: [],
      ring3NodeIds: [],
    },
    timestamp: Date.now(),
    version: LAYOUT_SNAPSHOT_VERSION,
  };
}

/**
 * Validates a snapshot is usable (correct version, not too old, etc.)
 */
export function isValidSnapshot(snapshot: LayoutSnapshot | null): snapshot is LayoutSnapshot {
  if (!snapshot) return false;
  if (snapshot.version !== LAYOUT_SNAPSHOT_VERSION) return false;
  // Could add age check here if needed (e.g., expire after 24 hours)
  return true;
}
