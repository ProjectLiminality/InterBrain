/**
 * MVP Tutorial Steps - Phase 1: "The Download"
 *
 * Quick walkthrough of core concepts using pre-populated demo vault.
 * Based on live demo flow that successfully introduced InterBrain in ~5 minutes.
 *
 * Demo vault nodes:
 * - InterBrain (Dream) - anchor point with logo
 * - Alice (Dreamer) - connected to Circle
 * - Bob (Dreamer) - connected to Square
 * - Circle (Dream) - simple shape idea
 * - Square (Dream) - simple shape idea
 * - Cylinder (Dream) - pre-woven with Circle+Square in DreamSong
 */

import { TutorialStep } from '../types';

/**
 * Position constants for 3D space
 * Based on liminal-web layout where center node is at z=-50
 */
const TEXT_POSITIONS = {
  // Center, slightly above the node
  centerAbove: [0, 8, -50] as [number, number, number],
  // Center, below the node
  centerBelow: [0, -10, -50] as [number, number, number],
  // Top of screen
  top: [0, 15, -50] as [number, number, number],
  // Bottom of screen
  bottom: [0, -15, -50] as [number, number, number],
};

/**
 * Node positions in liminal-web layout
 * Center node at origin (0,0,-50), ring nodes orbit around
 */
const NODE_POSITIONS = {
  center: [0, 0, -50] as [number, number, number],
  // Ring 1 positions (approximate, actual positions computed by layout)
  ring1Top: [0, 12, -100] as [number, number, number],
  ring1Right: [12, 0, -100] as [number, number, number],
  ring1Bottom: [0, -12, -100] as [number, number, number],
  ring1Left: [-12, 0, -100] as [number, number, number],
};

export const MVP_TUTORIAL_STEPS: TutorialStep[] = [
  // ============ SEGMENT: Anchor Point ============
  {
    id: 'anchor-1-welcome',
    segment: 'anchor-point',
    text: {
      content: 'Welcome to the InterBrain',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 56,
      duration: 3000,
    },
    onEnter: { type: 'set-layout', layout: 'liminal-web' },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'anchor-2-this-is',
    segment: 'anchor-point',
    text: {
      content: 'This blue circle is the InterBrain looking at itself',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 40,
      duration: 4000,
    },
    highlightNode: {
      nodeId: 'InterBrain',
      duration: 4000,
    },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'anchor-3-anchor',
    segment: 'anchor-point',
    text: {
      content: 'It anchors your DreamSpace',
      position: TEXT_POSITIONS.centerBelow,
      fontSize: 40,
      duration: 3000,
    },
    highlightNode: {
      nodeId: 'InterBrain',
      duration: 3000,
    },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'anchor-4-blue-dream',
    segment: 'anchor-point',
    text: {
      content: 'Blue circles are Dreams — ideas, projects, stories',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 36,
      duration: 4000,
    },
    advance: { type: 'auto', delay: 500 },
  },

  // ============ SEGMENT: Dreamer Nodes ============
  {
    id: 'dreamer-1-red',
    segment: 'dreamer-nodes',
    text: {
      content: 'Red circles are Dreamers — people you care about',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 36,
      duration: 4000,
    },
    goldenDot: {
      from: NODE_POSITIONS.center,
      to: NODE_POSITIONS.ring1Top,
      duration: 1.5,
      easing: 'easeInOut',
    },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'dreamer-2-alice',
    segment: 'dreamer-nodes',
    text: {
      content: 'Meet Alice',
      position: TEXT_POSITIONS.top,
      fontSize: 48,
      duration: 2500,
    },
    highlightNode: {
      nodeId: 'Alice',
      duration: 2500,
    },
    onEnter: { type: 'focus-node', nodeId: 'Alice' },
    advance: { type: 'auto', delay: 300 },
  },
  {
    id: 'dreamer-3-connections',
    segment: 'dreamer-nodes',
    text: {
      content: 'Selecting a Dreamer shows the ideas you share',
      position: TEXT_POSITIONS.centerBelow,
      fontSize: 32,
      duration: 4000,
    },
    advance: { type: 'auto', delay: 500 },
  },

  // ============ SEGMENT: DreamTalk ============
  {
    id: 'dreamtalk-1-symbol',
    segment: 'dreamtalk',
    text: {
      content: 'Every node has a DreamTalk — a symbolic thumbnail',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 32,
      duration: 4000,
    },
    onEnter: { type: 'focus-node', nodeId: 'InterBrain' },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'dreamtalk-2-logo',
    segment: 'dreamtalk',
    text: {
      content: 'This is the InterBrain logo',
      position: TEXT_POSITIONS.centerBelow,
      fontSize: 36,
      duration: 3000,
    },
    highlightNode: {
      nodeId: 'InterBrain',
      duration: 3000,
    },
    advance: { type: 'auto', delay: 500 },
  },

  // ============ SEGMENT: Navigate ============
  {
    id: 'navigate-1-click',
    segment: 'navigate',
    text: {
      content: 'Click any node to explore its connections',
      position: TEXT_POSITIONS.top,
      fontSize: 32,
      duration: 4000,
    },
    goldenDot: {
      from: NODE_POSITIONS.center,
      to: NODE_POSITIONS.ring1Right,
      duration: 1.2,
      easing: 'easeOut',
    },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'navigate-2-circle',
    segment: 'navigate',
    text: {
      content: 'Circle — a simple shape idea',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 40,
      duration: 3000,
    },
    onEnter: { type: 'focus-node', nodeId: 'Circle' },
    highlightNode: {
      nodeId: 'Circle',
      duration: 3000,
    },
    advance: { type: 'auto', delay: 500 },
  },

  // ============ SEGMENT: DreamSong ============
  {
    id: 'dreamsong-1-flip',
    segment: 'dreamsong',
    text: {
      content: 'The other side is the DreamSong',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 36,
      duration: 3000,
    },
    onEnter: { type: 'flip-node', nodeId: 'Cylinder', direction: 'back' },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'dreamsong-2-canvas',
    segment: 'dreamsong',
    text: {
      content: 'A canvas where you weave references to other ideas',
      position: TEXT_POSITIONS.centerBelow,
      fontSize: 32,
      duration: 4000,
    },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'dreamsong-3-cylinder',
    segment: 'dreamsong',
    text: {
      content: 'Cylinder weaves Circle and Square together',
      position: TEXT_POSITIONS.top,
      fontSize: 32,
      duration: 4000,
    },
    onEnter: { type: 'focus-node', nodeId: 'Cylinder' },
    advance: { type: 'auto', delay: 500 },
  },

  // ============ SEGMENT: Invitation (closing) ============
  {
    id: 'invite-1-who',
    segment: 'invitation',
    text: {
      content: 'Who are 1-3 people meaningful to you?',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 40,
      duration: 4000,
    },
    onEnter: { type: 'set-layout', layout: 'constellation' },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'invite-2-what',
    segment: 'invitation',
    text: {
      content: 'What ideas connect you to them?',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 40,
      duration: 4000,
    },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'invite-3-create',
    segment: 'invitation',
    text: {
      content: 'Create. Call. Share.',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 56,
      duration: 3000,
    },
    advance: { type: 'auto', delay: 500 },
  },
  {
    id: 'invite-4-gift',
    segment: 'invitation',
    text: {
      content: 'Pass on the gift',
      position: TEXT_POSITIONS.centerAbove,
      fontSize: 48,
      duration: 4000,
    },
    advance: { type: 'auto', delay: 1000 },
  },
];

/**
 * Get steps for a specific segment
 */
export function getStepsBySegment(segment: TutorialStep['segment']): TutorialStep[] {
  return MVP_TUTORIAL_STEPS.filter(step => step.segment === segment);
}

/**
 * Get step by ID
 */
export function getStepById(id: string): TutorialStep | undefined {
  return MVP_TUTORIAL_STEPS.find(step => step.id === id);
}
