import { StateCreator } from 'zustand';
import { FlipState } from '../dreamweaving/types/dreamsong';

// Re-export for convenience
export type { FlipState };

/**
 * Creator mode state - whether user is editing a DreamNode's files
 */
export interface CreatorModeState {
  isActive: boolean;
  nodeId: string | null;
}

/**
 * Flip animation state for all DreamNodes
 */
export interface FlipAnimationState {
  flippedNodeId: string | null;
  flipStates: Map<string, FlipState>;
}

/**
 * DreamNode slice - owns DreamNode-specific UI state
 * (flip animations, creator mode)
 */
export interface DreamNodeSlice {
  // Creator mode state
  creatorMode: CreatorModeState;
  setCreatorMode: (active: boolean, nodeId?: string | null) => void;

  // DreamNode flip animation state
  flipState: FlipAnimationState;
  setFlippedNode: (nodeId: string | null) => void;
  startFlipAnimation: (nodeId: string, direction: 'front-to-back' | 'back-to-front') => void;
  completeFlipAnimation: (nodeId: string) => void;
  resetAllFlips: () => void;
  getNodeFlipState: (nodeId: string) => FlipState | null;
}

/**
 * Creates the dreamnode slice
 */
export const createDreamNodeSlice: StateCreator<
  DreamNodeSlice,
  [],
  [],
  DreamNodeSlice
> = (set, get) => ({
  creatorMode: {
    isActive: false,
    nodeId: null
  },

  flipState: {
    flippedNodeId: null,
    flipStates: new Map<string, FlipState>()
  },

  setCreatorMode: (active, nodeId = null) => set({
    creatorMode: { isActive: active, nodeId: nodeId }
  }),

  setFlippedNode: (nodeId) => set((state) => {
    if (state.flipState.flippedNodeId && state.flipState.flippedNodeId !== nodeId) {
      const updatedFlipStates = new Map(state.flipState.flipStates);
      updatedFlipStates.delete(state.flipState.flippedNodeId);

      return {
        flipState: {
          flippedNodeId: nodeId,
          flipStates: updatedFlipStates
        }
      };
    }

    return {
      flipState: {
        ...state.flipState,
        flippedNodeId: nodeId
      }
    };
  }),

  startFlipAnimation: (nodeId, direction) => set((state) => {
    const updatedFlipStates = new Map(state.flipState.flipStates);

    const currentFlipState = updatedFlipStates.get(nodeId) || {
      isFlipped: false,
      isFlipping: false,
      flipDirection: 'front-to-back' as const,
      animationStartTime: 0
    };

    const newFlipState = {
      ...currentFlipState,
      isFlipping: true,
      flipDirection: direction,
      animationStartTime: globalThis.performance.now()
    };

    updatedFlipStates.set(nodeId, newFlipState);

    return {
      flipState: {
        ...state.flipState,
        flipStates: updatedFlipStates,
        flippedNodeId: nodeId
      }
    };
  }),

  completeFlipAnimation: (nodeId) => set((state) => {
    const updatedFlipStates = new Map(state.flipState.flipStates);
    const currentFlipState = updatedFlipStates.get(nodeId);

    if (currentFlipState) {
      const finalFlippedState = currentFlipState.flipDirection === 'front-to-back';
      const completedFlipState = {
        ...currentFlipState,
        isFlipped: finalFlippedState,
        isFlipping: false,
        animationStartTime: 0
      };

      updatedFlipStates.set(nodeId, completedFlipState);
    }

    return {
      flipState: {
        ...state.flipState,
        flipStates: updatedFlipStates
      }
    };
  }),

  resetAllFlips: () => set(() => ({
    flipState: {
      flippedNodeId: null,
      flipStates: new Map<string, FlipState>()
    }
  })),

  getNodeFlipState: (nodeId) => {
    return get().flipState.flipStates.get(nodeId) || null;
  },
});
