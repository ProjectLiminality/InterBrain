/**
 * Intent Derivation Helpers
 *
 * Pure functions that compute LayoutIntent from events.
 * These functions have no side effects and are testable in isolation.
 */

import { LayoutIntent, LayoutContext, DerivedIntentResult } from './types';

/**
 * Derive intent for holarchy navigation (clicking a supermodule while in holarchy mode).
 *
 * This handles the case where:
 * 1. User is viewing node A (flipped to back, showing supermodules)
 * 2. User clicks supermodule B in the ring
 * 3. Node B becomes the new center (flipped to back)
 * 4. Node B's supermodules appear in the ring
 * 5. Node A returns to constellation (unless it's one of B's supermodules)
 *
 * @param clickedNodeId - The node that was clicked
 * @param supermoduleIds - The supermodules of the clicked node (to show in ring)
 * @param context - Current layout context
 * @returns DerivedIntentResult with the computed intent
 */
export function deriveHolarchyNavigationIntent(
  clickedNodeId: string,
  supermoduleIds: string[],
  context: LayoutContext
): DerivedIntentResult {
  const intent: LayoutIntent = {
    center: {
      nodeId: clickedNodeId,
      flipSide: 'back' // Holarchy mode always shows back (supermodules view)
    },
    surroundingNodes: supermoduleIds
  };

  // Determine which nodes need to go home
  // The previous center goes home UNLESS it's one of the new supermodules
  const nodesToSendHome: string[] = [];
  if (context.currentCenter && context.currentCenter !== clickedNodeId) {
    if (!supermoduleIds.includes(context.currentCenter)) {
      nodesToSendHome.push(context.currentCenter);
    }
  }

  return {
    intent,
    nodesToSendHome,
    isHolarchyNavigation: true
  };
}

/**
 * Derive intent for normal node focus (clicking a node in liminal web mode).
 *
 * This handles the standard case where:
 * 1. User clicks a node
 * 2. That node becomes center (front side)
 * 3. Related nodes (dreamers) appear in the ring
 *
 * @param clickedNodeId - The node that was clicked
 * @param relatedNodeIds - The related nodes (dreamers) to show in ring
 * @param context - Current layout context
 * @returns DerivedIntentResult with the computed intent
 */
export function deriveFocusIntent(
  clickedNodeId: string,
  relatedNodeIds: string[],
  context: LayoutContext
): DerivedIntentResult {
  const intent: LayoutIntent = {
    center: {
      nodeId: clickedNodeId,
      flipSide: 'front' // Normal focus shows front side
    },
    surroundingNodes: relatedNodeIds
  };

  // Previous center goes home if different
  const nodesToSendHome: string[] = [];
  if (context.currentCenter && context.currentCenter !== clickedNodeId) {
    // In normal focus mode, the previous center always goes home
    // (unless it's in the related nodes, but that's handled by the layout)
    if (!relatedNodeIds.includes(context.currentCenter)) {
      nodesToSendHome.push(context.currentCenter);
    }
  }

  return {
    intent,
    nodesToSendHome,
    isHolarchyNavigation: false
  };
}

/**
 * Derive intent for returning to constellation view.
 *
 * This handles the case where:
 * 1. User presses Escape or clicks empty space
 * 2. All nodes return to their constellation positions
 *
 * @returns DerivedIntentResult with empty intent (all nodes go home)
 */
export function deriveConstellationIntent(): DerivedIntentResult {
  const intent: LayoutIntent = {
    center: null,
    surroundingNodes: []
  };

  return {
    intent,
    nodesToSendHome: [], // Everything implicitly goes home when intent is empty
    isHolarchyNavigation: false
  };
}

/**
 * Derive intent for search results layout.
 *
 * This handles the case where:
 * 1. User performs a search
 * 2. Search results appear in ring layout (no center)
 *
 * @param searchResultIds - Ordered list of search result node IDs
 * @returns DerivedIntentResult with search layout intent
 */
export function deriveSearchIntent(searchResultIds: string[]): DerivedIntentResult {
  const intent: LayoutIntent = {
    center: null, // No center in search mode
    surroundingNodes: searchResultIds
  };

  return {
    intent,
    nodesToSendHome: [],
    isHolarchyNavigation: false
  };
}

/**
 * Build a LayoutContext from the current store state.
 *
 * @param currentCenterId - Currently centered node ID (or null)
 * @param flipStates - Map of node flip states
 * @param layoutMode - Current spatial layout mode
 * @returns LayoutContext for intent derivation
 */
export function buildLayoutContext(
  currentCenterId: string | null,
  flipStates: Map<string, { isFlipped: boolean; isFlipping: boolean }>,
  layoutMode: 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'relationship-edit' | 'copilot'
): LayoutContext {
  let currentCenterFlipSide: 'front' | 'back' | null = null;
  let isHolarchyMode = false;

  if (currentCenterId) {
    const flipState = flipStates.get(currentCenterId);
    if (flipState?.isFlipped && !flipState?.isFlipping) {
      currentCenterFlipSide = 'back';
      isHolarchyMode = true;
    } else if (!flipState?.isFlipping) {
      currentCenterFlipSide = 'front';
    }
  }

  return {
    currentCenter: currentCenterId,
    currentCenterFlipSide,
    layoutMode,
    isHolarchyMode
  };
}

/**
 * Check if a transition is a holarchy navigation.
 *
 * Holarchy navigation is when:
 * - We're in holarchy mode (current center is flipped to back)
 * - And clicking a different node (which will also flip to back)
 *
 * @param context - Current layout context
 * @param targetNodeId - Node being navigated to
 * @returns true if this is holarchy navigation
 */
export function isHolarchyNavigation(
  context: LayoutContext,
  targetNodeId: string
): boolean {
  return (
    context.isHolarchyMode &&
    context.currentCenter !== null &&
    context.currentCenter !== targetNodeId
  );
}
