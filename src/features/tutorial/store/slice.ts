/**
 * Tutorial Store Slice - State management for tutorial system
 *
 * Manages:
 * - Tutorial active state
 * - Current step tracking
 * - Node highlight for golden glow
 * - Completion tracking
 */

import { TutorialState } from '../types';

export interface TutorialSlice {
  // Tutorial state
  tutorial: TutorialState;

  // Actions
  startTutorial: () => void;
  endTutorial: () => void;
  skipTutorial: () => void;
  setTutorialStepIndex: (index: number) => void;
  setHighlightedNodeId: (nodeId: string | null) => void;
  setTutorialPhase: (phase: 'download' | 'personalize' | null) => void;
  markTutorialComplete: () => void;
}

export const createTutorialSlice = (set: any, _get: any): TutorialSlice => ({
  tutorial: {
    isActive: false,
    currentStepIndex: -1,
    hasCompleted: false,
    phase: null,
    demoNodeIds: [],
    highlightedNodeId: null,
  },

  startTutorial: () => set((state: any) => ({
    tutorial: {
      ...state.tutorial,
      isActive: true,
      currentStepIndex: 0,
      phase: 'download',
    }
  })),

  endTutorial: () => set((state: any) => ({
    tutorial: {
      ...state.tutorial,
      isActive: false,
      currentStepIndex: -1,
      phase: null,
      highlightedNodeId: null,
    }
  })),

  skipTutorial: () => set((state: any) => ({
    tutorial: {
      ...state.tutorial,
      isActive: false,
      currentStepIndex: -1,
      hasCompleted: true,
      phase: null,
      highlightedNodeId: null,
    }
  })),

  setTutorialStepIndex: (index: number) => set((state: any) => ({
    tutorial: {
      ...state.tutorial,
      currentStepIndex: index,
    }
  })),

  setHighlightedNodeId: (nodeId: string | null) => set((state: any) => ({
    tutorial: {
      ...state.tutorial,
      highlightedNodeId: nodeId,
    }
  })),

  setTutorialPhase: (phase: 'download' | 'personalize' | null) => set((state: any) => ({
    tutorial: {
      ...state.tutorial,
      phase,
    }
  })),

  markTutorialComplete: () => set((state: any) => ({
    tutorial: {
      ...state.tutorial,
      hasCompleted: true,
    }
  })),
});

// Persistence helpers (for localStorage)
export function extractTutorialPersistenceData(state: TutorialSlice): { hasCompleted: boolean } {
  return {
    hasCompleted: state.tutorial.hasCompleted,
  };
}

export function restoreTutorialPersistenceData(
  state: TutorialSlice,
  data: { hasCompleted?: boolean }
): Partial<TutorialSlice> {
  return {
    tutorial: {
      ...state.tutorial,
      hasCompleted: data.hasCompleted || false,
    }
  };
}
