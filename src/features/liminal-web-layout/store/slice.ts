import { StateCreator } from 'zustand';
import { DreamNode } from '../../dreamnode/types/dreamnode';
import { FlipState } from '../../dreamweaving/types/dreamsong';

/**
 * Navigation history entry for undo/redo
 */
export interface NavigationHistoryEntry {
  nodeId: string | null;
  layout: 'constellation' | 'liminal-web';
  timestamp: number;
  flipState: FlipState | null;
}

/**
 * Navigation history state
 */
export interface NavigationHistoryState {
  history: NavigationHistoryEntry[];
  currentIndex: number;
  maxHistorySize: number;
}

/**
 * Initial navigation history state
 */
export const INITIAL_NAVIGATION_HISTORY: NavigationHistoryState = {
  history: [{
    nodeId: null,
    layout: 'constellation',
    timestamp: Date.now(),
    flipState: null
  }],
  currentIndex: 0,
  maxHistorySize: 150
};

/**
 * Liminal Web slice - owns selected node and navigation history
 */
export interface LiminalWebSlice {
  // Selected DreamNode state
  selectedNode: DreamNode | null;
  setSelectedNode: (node: DreamNode | null) => void;

  // Navigation history management
  navigationHistory: NavigationHistoryState;
  isRestoringFromHistory: boolean;
  setRestoringFromHistory: (restoring: boolean) => void;
  addHistoryEntry: (nodeId: string | null, layout: 'constellation' | 'liminal-web') => void;
  getHistoryEntryForUndo: () => NavigationHistoryEntry | null;
  getHistoryEntryForRedo: () => NavigationHistoryEntry | null;
  performUndo: () => boolean;
  performRedo: () => boolean;
  clearNavigationHistory: () => void;
  restoreVisualState: (entry: NavigationHistoryEntry) => void;
}

// Type for accessing flipState from dreamnode slice
interface WithFlipState {
  flipState: {
    flipStates: Map<string, FlipState>;
    flippedNodeId: string | null;
  };
}

// Type for accessing spatialLayout from core
interface WithSpatialLayout {
  spatialLayout: string;
}

/**
 * Creates the liminal web slice
 * Note: This slice accesses flipState from dreamnode slice for history entries
 */
export const createLiminalWebSlice: StateCreator<
  LiminalWebSlice & WithFlipState & WithSpatialLayout,
  [],
  [],
  LiminalWebSlice
> = (set, _get) => ({
  selectedNode: null,
  navigationHistory: INITIAL_NAVIGATION_HISTORY,
  isRestoringFromHistory: false,

  setSelectedNode: (node) => set((state) => {
    const previousNode = state.selectedNode;
    const currentLayout = state.spatialLayout;

    // Trigger lazy media loading for node and 2-degree neighborhood
    if (node) {
      import('../../dreamnode/services/media-loading-service').then(({ getMediaLoadingService }) => {
        try {
          const mediaLoadingService = getMediaLoadingService();
          mediaLoadingService.loadNodeWithNeighborhood(node.id);
        } catch (error) {
          console.warn('[Store] MediaLoadingService not initialized:', error);
        }
      }).catch(error => {
        console.error('[Store] Failed to load media service:', error);
      });
    }

    // Detect meaningful node selection changes for history tracking
    const isMeaningfulChange = (
      currentLayout === 'liminal-web' &&
      previousNode &&
      node &&
      previousNode.id !== node.id
    );

    if (isMeaningfulChange && !state.isRestoringFromHistory) {
      const newEntry: NavigationHistoryEntry = {
        nodeId: node.id,
        layout: 'liminal-web',
        timestamp: Date.now(),
        flipState: state.flipState.flipStates.get(node.id) || null
      };

      const { history, currentIndex, maxHistorySize } = state.navigationHistory;

      const currentEntry = history[currentIndex];
      const isDuplicate = currentEntry &&
        currentEntry.nodeId === newEntry.nodeId &&
        currentEntry.layout === newEntry.layout;

      if (isDuplicate) {
        return { selectedNode: node };
      }

      const newHistory = currentIndex >= 0
        ? [...history.slice(0, currentIndex + 1), newEntry]
        : [newEntry];

      const trimmedHistory = newHistory.length > maxHistorySize
        ? newHistory.slice(-maxHistorySize)
        : newHistory;

      return {
        selectedNode: node,
        navigationHistory: {
          ...state.navigationHistory,
          history: trimmedHistory,
          currentIndex: trimmedHistory.length - 1
        }
      };
    }

    return { selectedNode: node };
  }),

  setRestoringFromHistory: (restoring) => set({ isRestoringFromHistory: restoring }),

  addHistoryEntry: (nodeId, layout) => set((state) => {
    const { history, currentIndex, maxHistorySize } = state.navigationHistory;

    const newEntry: NavigationHistoryEntry = {
      nodeId,
      layout,
      timestamp: Date.now(),
      flipState: (nodeId && layout === 'liminal-web') ?
        state.flipState.flipStates.get(nodeId) || null : null
    };

    const newHistory = currentIndex >= 0
      ? [...history.slice(0, currentIndex + 1), newEntry]
      : [newEntry];

    const trimmedHistory = newHistory.length > maxHistorySize
      ? newHistory.slice(-maxHistorySize)
      : newHistory;

    return {
      navigationHistory: {
        ...state.navigationHistory,
        history: trimmedHistory,
        currentIndex: trimmedHistory.length - 1
      }
    };
  }),

  getHistoryEntryForUndo: () => null,
  getHistoryEntryForRedo: () => null,

  performUndo: () => {
    let success = false;

    set((state) => {
      const { currentIndex } = state.navigationHistory;

      if (currentIndex <= 0) {
        return state;
      }

      success = true;

      return {
        navigationHistory: {
          ...state.navigationHistory,
          currentIndex: currentIndex - 1
        }
      };
    });

    return success;
  },

  performRedo: () => {
    let success = false;

    set((state) => {
      const { currentIndex, history } = state.navigationHistory;

      if (currentIndex >= history.length - 1) {
        return state;
      }

      success = true;

      return {
        navigationHistory: {
          ...state.navigationHistory,
          currentIndex: currentIndex + 1
        }
      };
    });

    return success;
  },

  clearNavigationHistory: () => set((state) => ({
    navigationHistory: {
      ...state.navigationHistory,
      history: [],
      currentIndex: -1
    }
  })),

  restoreVisualState: (entry) => set((state) => {
    const newState: Partial<LiminalWebSlice & WithFlipState> = {};

    if (entry.nodeId && entry.flipState) {
      const updatedFlipStates = new Map(state.flipState.flipStates);
      updatedFlipStates.set(entry.nodeId, entry.flipState);

      newState.flipState = {
        ...state.flipState,
        flipStates: updatedFlipStates,
        flippedNodeId: entry.flipState.isFlipped ? entry.nodeId : state.flipState.flippedNodeId
      };
    }

    return newState;
  }),
});
