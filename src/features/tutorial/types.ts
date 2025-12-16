/**
 * Tutorial Types - Declarative step definitions for MVP onboarding
 *
 * Design principles:
 * - Steps as data, not code (easy to reorder/modify)
 * - Each step can have text, golden dot, and actions
 * - Segments group related steps for modularity
 */

/**
 * A single tutorial step
 */
export interface TutorialStep {
  /** Unique identifier for this step */
  id: string;

  /** Segment this step belongs to */
  segment: TutorialSegment;

  /** Text to display via ManimText */
  text?: {
    content: string;
    /** Position in 3D space [x, y, z] */
    position: [number, number, number];
    /** Font size (default 48) */
    fontSize?: number;
    /** Duration to show text in ms (before auto-advance) */
    duration?: number;
  };

  /** Golden dot animation - position-based */
  goldenDot?: {
    from: [number, number, number];
    to: [number, number, number];
    /** Optional Bezier control points */
    controlPoints?: [number, number, number][];
    duration?: number;
    easing?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
  };

  /** Golden dot animation - node-based (resolves positions from store) */
  goldenDotNodes?: {
    fromNodeId: string;
    toNodeId: string;
    /** Optional Bezier control points */
    controlPoints?: [number, number, number][];
    duration?: number;
    easing?: 'linear' | 'easeInOut' | 'easeIn' | 'easeOut';
  };

  /** Node to highlight with golden glow */
  highlightNode?: {
    /** Node ID to highlight (e.g., 'InterBrain', 'Alice') */
    nodeId: string;
    /** Duration of highlight in ms */
    duration?: number;
  };

  /** Action to perform when step starts */
  onEnter?: TutorialAction;

  /** Action to perform when step ends */
  onExit?: TutorialAction;

  /** How to advance to next step */
  advance: {
    /** 'auto' = after duration, 'click' = user clicks, 'action' = after action completes */
    type: 'auto' | 'click' | 'action';
    /** For 'auto': delay in ms after animations complete */
    delay?: number;
  };
}

/**
 * Tutorial segments - logical groupings of steps
 */
export type TutorialSegment =
  | 'anchor-point'      // InterBrain introduction
  | 'dreamer-nodes'     // Red nodes = people
  | 'dreamtalk'         // Symbol/thumbnail side
  | 'navigate'          // Click through liminal web
  | 'dreamsong'         // Canvas side
  | 'edit-canvas'       // Edit mode
  | 'relationships'     // Add connections
  | 'create-node'       // Drag-drop creation
  | 'weaving'           // DreamSong references
  | 'copilot'           // Video call intro
  | 'invitation';       // Closing message

/**
 * Actions the tutorial can trigger
 */
export type TutorialAction =
  | { type: 'select-node'; nodeId: string }
  | { type: 'focus-node'; nodeId: string }
  | { type: 'flip-node'; nodeId: string; direction: 'front' | 'back' }
  | { type: 'set-layout'; layout: 'constellation' | 'liminal-web' }
  | { type: 'execute-command'; commandId: string }
  | { type: 'highlight-glow'; nodeId: string; duration: number }
  | { type: 'wait'; duration: number };

/**
 * Tutorial state for the store
 */
export interface TutorialState {
  /** Whether tutorial is currently active */
  isActive: boolean;

  /** Current step index (-1 if inactive) */
  currentStepIndex: number;

  /** Whether tutorial has been completed before */
  hasCompleted: boolean;

  /** Current phase: 'download' (Phase 1) or 'personalize' (Phase 2) */
  phase: 'download' | 'personalize' | null;

  /** IDs of demo vault nodes (symlinked, removed after tutorial) */
  demoNodeIds: string[];

  /** Node currently highlighted with golden glow */
  highlightedNodeId: string | null;
}

/**
 * Demo vault configuration
 */
export interface DemoVaultConfig {
  /** Path to bundled demo nodes within plugin */
  bundlePath: string;

  /** Node definitions */
  nodes: DemoNodeConfig[];
}

export interface DemoNodeConfig {
  /** Node ID (folder name) */
  id: string;

  /** Display name */
  name: string;

  /** Node type */
  type: 'dream' | 'dreamer';

  /** IDs of connected nodes */
  connections: string[];

  /** Whether node has pre-woven DreamSong content */
  hasDreamSong: boolean;
}
