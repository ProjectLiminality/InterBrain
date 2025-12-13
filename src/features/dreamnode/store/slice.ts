import { StateCreator } from 'zustand';
import { FlipState } from '../../dreamweaving/types/dreamsong';
import { DreamNode } from '../types/dreamnode';

// Re-export for convenience
export type { FlipState };

// ============================================================================
// DREAMNODE DATA TYPES
// ============================================================================

/**
 * DreamNode data with sync metadata
 * (Renamed from RealNodeData - the "real" prefix was from mock/real distinction)
 */
export interface DreamNodeData {
  node: DreamNode;
  fileHash?: string;
  lastSynced: number;
}

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

// ============================================================================
// DREAMNODE SLICE INTERFACE
// ============================================================================

/**
 * DreamNode slice - owns ALL DreamNode state
 * - dreamNodes: The actual node data (was realNodes in core store)
 * - flipState: Flip animation UI state
 * - creatorMode: Creator mode UI state
 */
export interface DreamNodeSlice {
  // DreamNode data storage
  dreamNodes: Map<string, DreamNodeData>;
  setDreamNodes: (nodes: Map<string, DreamNodeData>) => void;
  updateDreamNode: (id: string, data: DreamNodeData) => void;
  batchUpdateDreamNodePositions: (positions: Map<string, [number, number, number]>) => void;
  deleteDreamNode: (id: string) => void;

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

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

/**
 * Extract dreamNodes data for persistence (Map → Array)
 */
export const extractDreamNodePersistenceData = (state: DreamNodeSlice) => ({
  dreamNodes: Array.from(state.dreamNodes.entries()),
});

/**
 * Restore dreamNodes data from persistence (Array → Map)
 */
export const restoreDreamNodePersistenceData = (persisted: {
  dreamNodes?: [string, DreamNodeData][];
}) => ({
  dreamNodes: persisted.dreamNodes ? new Map(persisted.dreamNodes) : new Map(),
});

// ============================================================================
// SLICE CREATOR
// ============================================================================

/**
 * Creates the dreamnode slice
 *
 * Note: We use `any` for set() when updating realNodes because it's a cross-slice
 * backward compatibility alias that exists in CoreSlice. TypeScript's StateCreator
 * only knows about this slice's interface, not the full composed state.
 */
export const createDreamNodeSlice: StateCreator<
  DreamNodeSlice,
  [],
  [],
  DreamNodeSlice
> = (set, get) => ({
  // DreamNode data storage
  dreamNodes: new Map<string, DreamNodeData>(),

  // All setters update both dreamNodes and realNodes for backward compatibility
  setDreamNodes: (nodes) => (set as any)({ dreamNodes: nodes, realNodes: nodes }),

  updateDreamNode: (id, data) => set((state) => {
    const newMap = new Map(state.dreamNodes);
    newMap.set(id, data);
    return { dreamNodes: newMap, realNodes: newMap } as any;
  }),

  batchUpdateDreamNodePositions: (positions) => set((state) => {
    const newMap = new Map(state.dreamNodes);
    for (const [nodeId, position] of positions) {
      const nodeData = newMap.get(nodeId);
      if (nodeData) {
        newMap.set(nodeId, {
          ...nodeData,
          node: { ...nodeData.node, position }
        });
      }
    }
    return { dreamNodes: newMap, realNodes: newMap } as any;
  }),

  deleteDreamNode: (id) => set((state) => {
    const newMap = new Map(state.dreamNodes);
    newMap.delete(id);
    return { dreamNodes: newMap, realNodes: newMap } as any;
  }),

  // Creator mode state
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
