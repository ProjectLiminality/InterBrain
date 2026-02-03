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
