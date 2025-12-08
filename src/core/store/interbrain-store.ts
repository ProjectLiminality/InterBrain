/**
 * InterBrain Store - Core state management with slice composition
 *
 * This store combines minimal core state with feature-specific slices.
 * Each feature owns its state in its respective slice file.
 *
 * Core State (lives here):
 * - realNodes: Fundamental DreamNode data
 * - selectedNode: Current focus
 * - spatialLayout: Which mode is active
 * - camera: 3D view state
 * - navigationHistory: Undo/redo across features
 * - flipState: DreamNode flip animations
 * - creatorMode: Whether editing a node's files
 * - debug flags
 *
 * Feature Slices (imported from features/):
 * - SearchSlice: searchResults, searchInterface, vectorData, ollamaConfig
 * - ConstellationSlice: constellationData, fibonacciConfig
 * - CopilotModeSlice: copilotMode state and actions
 * - EditModeSlice: editMode state and actions
 * - CreationSlice: creationState and actions
 * - RadialButtonsSlice: radialButtonUI
 * - UpdatesSlice: updateStatus
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DreamNode } from '../types/dreamnode';
import { DreamSongData } from '../types/dreamsong';
import { FlipState } from '../types/dreamsong';

// Feature slice imports
import {
  SearchSlice,
  createSearchSlice,
  extractSearchPersistenceData,
  restoreSearchPersistenceData,
  SearchInterfaceState,
} from '../../features/semantic-search/search-slice';
import type { OllamaConfig } from '../../features/semantic-search/search-slice';
import { VectorData } from '../../features/semantic-search/services/indexing-service';

import {
  ConstellationSlice,
  createConstellationSlice,
  extractConstellationPersistenceData,
  restoreConstellationPersistenceData,
  SerializableDreamSongGraph,
} from '../../features/constellation-layout/constellation-slice';

import {
  CopilotModeSlice,
  createCopilotModeSlice,
  CopilotModeState,
} from '../../features/conversational-copilot/copilot-slice';

import {
  EditModeSlice,
  createEditModeSlice,
  EditModeState,
  EditModeValidationErrors,
} from '../../features/edit-mode/edit-slice';

import {
  CreationSlice,
  createCreationSlice,
  CreationState,
  ProtoNode,
  ValidationErrors,
} from '../../features/dream-node-management/creation-slice';

import {
  RadialButtonsSlice,
  createRadialButtonsSlice,
} from '../../features/radial-buttons/radial-buttons-slice';

import {
  UpdatesSlice,
  createUpdatesSlice,
} from '../../features/updates/updates-slice';

// Type alias for spatial layout modes (the active view mode, not to be confused with SpatialLayout interface in dreamnode.ts)
export type SpatialLayoutMode = 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'edit-search' | 'copilot';

// Re-export types for backward compatibility
export type { CopilotModeState };
export type { EditModeState, EditModeValidationErrors };
export type { CreationState, ProtoNode, ValidationErrors };
export type { SearchInterfaceState };

// Helper function to get current scroll position of DreamSong content
function getDreamSongScrollPosition(nodeId: string): number | null {
  try {
    if (typeof document === 'undefined') return null;

    const dreamSongLeaf = document.querySelector(`[data-type="dreamsong-fullscreen"][data-node-id="${nodeId}"]`);
    if (dreamSongLeaf) {
      const scrollContainer = dreamSongLeaf.querySelector('.dreamsong-content');
      if (scrollContainer && 'scrollTop' in scrollContainer) {
        return (scrollContainer as HTMLElement).scrollTop;
      }
    }

    const dreamSpaceContent = document.querySelector(`.dreamsong-container[data-node-id="${nodeId}"] .dreamsong-content`);
    if (dreamSpaceContent && 'scrollTop' in dreamSpaceContent) {
      return (dreamSpaceContent as HTMLElement).scrollTop;
    }

    return null;
  } catch (error) {
    console.warn(`Failed to get scroll position for node ${nodeId}:`, error);
    return null;
  }
}

function restoreDreamSongScrollPosition(nodeId: string, scrollPosition: number): void {
  try {
    if (typeof document === 'undefined') return;

    const dreamSongLeaf = document.querySelector(`[data-type="dreamsong-fullscreen"][data-node-id="${nodeId}"]`);
    if (dreamSongLeaf) {
      const scrollContainer = dreamSongLeaf.querySelector('.dreamsong-content');
      if (scrollContainer && 'scrollTop' in scrollContainer) {
        (scrollContainer as HTMLElement).scrollTop = scrollPosition;
        return;
      }
    }

    const dreamSpaceContent = document.querySelector(`.dreamsong-container[data-node-id="${nodeId}"] .dreamsong-content`);
    if (dreamSpaceContent && 'scrollTop' in dreamSpaceContent) {
      (dreamSpaceContent as HTMLElement).scrollTop = scrollPosition;
    }
  } catch (error) {
    console.warn(`Failed to restore scroll position for node ${nodeId}:`, error);
  }
}

// ============================================================================
// CORE STATE TYPES
// ============================================================================

export interface NavigationHistoryEntry {
  nodeId: string | null;
  layout: 'constellation' | 'liminal-web';
  timestamp: number;
  flipState: FlipState | null;
  scrollPosition: number | null;
}

export interface NavigationHistoryState {
  history: NavigationHistoryEntry[];
  currentIndex: number;
  maxHistorySize: number;
}

export interface RealNodeData {
  node: DreamNode;
  fileHash?: string;
  lastSynced: number;
}

export interface DreamSongCacheEntry {
  data: DreamSongData;
  timestamp: number;
  structureHash: string;
}

// ============================================================================
// CORE SLICE - Fundamental state that belongs to no single feature
// ============================================================================

export interface CoreSlice {
  // Real nodes storage (persisted)
  realNodes: Map<string, RealNodeData>;
  setRealNodes: (nodes: Map<string, RealNodeData>) => void;
  updateRealNode: (id: string, data: RealNodeData) => void;
  batchUpdateNodePositions: (positions: Map<string, [number, number, number]>) => void;
  deleteRealNode: (id: string) => void;

  // Selected DreamNode state
  selectedNode: DreamNode | null;
  setSelectedNode: (node: DreamNode | null) => void;

  // Selected DreamNode's DreamSong data
  selectedNodeDreamSongData: DreamSongData | null;
  setSelectedNodeDreamSongData: (data: DreamSongData | null) => void;

  // DreamSong cache for service layer
  dreamSongCache: Map<string, DreamSongCacheEntry>;
  getCachedDreamSong: (nodeId: string, structureHash: string) => DreamSongCacheEntry | null;
  setCachedDreamSong: (nodeId: string, structureHash: string, data: DreamSongData) => void;

  // Creator mode state
  creatorMode: {
    isActive: boolean;
    nodeId: string | null;
  };
  setCreatorMode: (active: boolean, nodeId?: string | null) => void;

  // Spatial layout state
  spatialLayout: SpatialLayoutMode;
  setSpatialLayout: (layout: SpatialLayoutMode) => void;

  // Camera state management
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    isTransitioning: boolean;
    transitionDuration: number;
  };
  setCameraPosition: (position: [number, number, number]) => void;
  setCameraTarget: (target: [number, number, number]) => void;
  setCameraTransition: (isTransitioning: boolean, duration?: number) => void;

  // Layout transition state
  layoutTransition: {
    isTransitioning: boolean;
    progress: number;
    previousLayout: 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'edit-search' | 'copilot' | null;
  };
  setLayoutTransition: (isTransitioning: boolean, progress?: number, previousLayout?: 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'edit-search' | 'copilot' | null) => void;

  // Debug flags
  debugWireframeSphere: boolean;
  setDebugWireframeSphere: (visible: boolean) => void;
  debugIntersectionPoint: boolean;
  setDebugIntersectionPoint: (visible: boolean) => void;
  debugFlyingControls: boolean;
  setDebugFlyingControls: (enabled: boolean) => void;

  // Drag state
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;

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

  // DreamNode flip animation state
  flipState: {
    flippedNodeId: string | null;
    flipStates: Map<string, FlipState>;
  };
  setFlippedNode: (nodeId: string | null) => void;
  startFlipAnimation: (nodeId: string, direction: 'front-to-back' | 'back-to-front') => void;
  completeFlipAnimation: (nodeId: string) => void;
  resetAllFlips: () => void;
  getNodeFlipState: (nodeId: string) => FlipState | null;
}

// ============================================================================
// COMBINED STATE TYPE
// ============================================================================

export interface InterBrainState extends
  CoreSlice,
  SearchSlice,
  ConstellationSlice,
  CopilotModeSlice,
  EditModeSlice,
  CreationSlice,
  RadialButtonsSlice,
  UpdatesSlice {}

// ============================================================================
// CORE SLICE CREATOR
// ============================================================================

const createCoreSlice = (set: any, get: any): CoreSlice => ({
  // Initial state
  realNodes: new Map<string, RealNodeData>(),
  selectedNode: null,
  selectedNodeDreamSongData: null,
  dreamSongCache: new Map<string, DreamSongCacheEntry>(),

  creatorMode: {
    isActive: false,
    nodeId: null
  },

  spatialLayout: 'constellation',

  camera: {
    position: [0, 0, 0],
    target: [0, 0, 0],
    isTransitioning: false,
    transitionDuration: 1000,
  },

  layoutTransition: {
    isTransitioning: false,
    progress: 0,
    previousLayout: null,
  },

  debugWireframeSphere: false,
  debugIntersectionPoint: false,
  debugFlyingControls: false,
  isDragging: false,

  navigationHistory: {
    history: [{
      nodeId: null,
      layout: 'constellation',
      timestamp: Date.now(),
      flipState: null,
      scrollPosition: null
    }],
    currentIndex: 0,
    maxHistorySize: 150
  },

  isRestoringFromHistory: false,

  flipState: {
    flippedNodeId: null,
    flipStates: new Map<string, FlipState>()
  },

  // Actions
  setRealNodes: (nodes) => set({ realNodes: nodes }),

  updateRealNode: (id, data) => set((state: InterBrainState) => {
    const newMap = new Map(state.realNodes);
    newMap.set(id, data);
    return { realNodes: newMap };
  }),

  batchUpdateNodePositions: (positions) => set((state: InterBrainState) => {
    const newMap = new Map(state.realNodes);
    for (const [nodeId, position] of positions) {
      const nodeData = newMap.get(nodeId);
      if (nodeData) {
        newMap.set(nodeId, {
          ...nodeData,
          node: { ...nodeData.node, position }
        });
      }
    }
    return { realNodes: newMap };
  }),

  deleteRealNode: (id) => set((state: InterBrainState) => {
    const newMap = new Map(state.realNodes);
    newMap.delete(id);
    return { realNodes: newMap };
  }),

  setSelectedNode: (node) => set((state: InterBrainState) => {
    const previousNode = state.selectedNode;
    const currentLayout = state.spatialLayout;

    // Trigger lazy media loading for node and 2-degree neighborhood
    if (node) {
      import('../services/media-loading-service').then(({ getMediaLoadingService }) => {
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
        flipState: state.flipState.flipStates.get(node.id) || null,
        scrollPosition: getDreamSongScrollPosition(node.id)
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

  setSelectedNodeDreamSongData: (data) => set({ selectedNodeDreamSongData: data }),

  getCachedDreamSong: (nodeId: string, structureHash: string) => {
    const cacheKey = `${nodeId}-${structureHash}`;
    return get().dreamSongCache.get(cacheKey) || null;
  },

  setCachedDreamSong: (nodeId: string, structureHash: string, data: DreamSongData) => {
    const cacheKey = `${nodeId}-${structureHash}`;
    const entry: DreamSongCacheEntry = {
      data,
      timestamp: Date.now(),
      structureHash
    };
    set((state: InterBrainState) => {
      const newCache = new Map(state.dreamSongCache);
      newCache.set(cacheKey, entry);
      return { dreamSongCache: newCache };
    });
  },

  setCreatorMode: (active, nodeId = null) => set({
    creatorMode: { isActive: active, nodeId: nodeId }
  }),

  setSpatialLayout: (layout) => set((state: InterBrainState) => {
    const previousLayout = state.spatialLayout;
    const selectedNode = state.selectedNode;

    const isMeaningfulChange = (
      (previousLayout === 'constellation' && layout === 'liminal-web' && selectedNode) ||
      (previousLayout === 'liminal-web' && layout === 'constellation')
    );

    if (isMeaningfulChange && !state.isRestoringFromHistory) {
      const newEntry: NavigationHistoryEntry = {
        nodeId: layout === 'liminal-web' ? selectedNode?.id || null : null,
        layout: layout as 'constellation' | 'liminal-web',
        timestamp: Date.now(),
        flipState: (layout === 'liminal-web' && selectedNode) ?
          state.flipState.flipStates.get(selectedNode.id) || null : null,
        scrollPosition: (layout === 'liminal-web' && selectedNode) ?
          getDreamSongScrollPosition(selectedNode.id) : null
      };

      const { history, currentIndex, maxHistorySize } = state.navigationHistory;

      const currentEntry = history[currentIndex];
      const isDuplicate = currentEntry &&
        currentEntry.nodeId === newEntry.nodeId &&
        currentEntry.layout === newEntry.layout;

      if (isDuplicate) {
        return {
          spatialLayout: layout,
          layoutTransition: {
            ...state.layoutTransition,
            previousLayout: state.spatialLayout,
          }
        };
      }

      const newHistory = currentIndex >= 0
        ? [...history.slice(0, currentIndex + 1), newEntry]
        : [newEntry];

      const trimmedHistory = newHistory.length > maxHistorySize
        ? newHistory.slice(-maxHistorySize)
        : newHistory;

      return {
        spatialLayout: layout,
        layoutTransition: {
          ...state.layoutTransition,
          previousLayout: state.spatialLayout,
        },
        navigationHistory: {
          ...state.navigationHistory,
          history: trimmedHistory,
          currentIndex: trimmedHistory.length - 1
        }
      };
    }

    return {
      spatialLayout: layout,
      layoutTransition: {
        ...state.layoutTransition,
        previousLayout: state.spatialLayout,
      }
    };
  }),

  setCameraPosition: (position) => set((state: InterBrainState) => ({
    camera: { ...state.camera, position }
  })),

  setCameraTarget: (target) => set((state: InterBrainState) => ({
    camera: { ...state.camera, target }
  })),

  setCameraTransition: (isTransitioning, duration = 1000) => set((state: InterBrainState) => ({
    camera: { ...state.camera, isTransitioning, transitionDuration: duration }
  })),

  setLayoutTransition: (isTransitioning, progress = 0, previousLayout = null) => set((state: InterBrainState) => ({
    layoutTransition: {
      isTransitioning,
      progress,
      previousLayout: previousLayout || state.layoutTransition.previousLayout
    }
  })),

  setDebugWireframeSphere: (visible) => set({ debugWireframeSphere: visible }),
  setDebugIntersectionPoint: (visible) => set({ debugIntersectionPoint: visible }),
  setDebugFlyingControls: (enabled) => set({ debugFlyingControls: enabled }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),

  // Navigation history actions
  addHistoryEntry: (nodeId, layout) => set((state: InterBrainState) => {
    const { history, currentIndex, maxHistorySize } = state.navigationHistory;

    const newEntry: NavigationHistoryEntry = {
      nodeId,
      layout,
      timestamp: Date.now(),
      flipState: (nodeId && layout === 'liminal-web') ?
        state.flipState.flipStates.get(nodeId) || null : null,
      scrollPosition: (nodeId && layout === 'liminal-web') ?
        getDreamSongScrollPosition(nodeId) : null
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

    set((state: InterBrainState) => {
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

    set((state: InterBrainState) => {
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

  clearNavigationHistory: () => set((state: InterBrainState) => ({
    navigationHistory: {
      ...state.navigationHistory,
      history: [],
      currentIndex: -1
    }
  })),

  setRestoringFromHistory: (restoring) => set({ isRestoringFromHistory: restoring }),

  restoreVisualState: (entry) => set((state: InterBrainState) => {
    const newState: Partial<InterBrainState> = {};

    if (entry.nodeId && entry.flipState) {
      const updatedFlipStates = new Map(state.flipState.flipStates);
      updatedFlipStates.set(entry.nodeId, entry.flipState);

      newState.flipState = {
        ...state.flipState,
        flipStates: updatedFlipStates,
        flippedNodeId: entry.flipState.isFlipped ? entry.nodeId : state.flipState.flippedNodeId
      };
    }

    if (entry.nodeId && entry.scrollPosition !== null) {
      if (typeof setTimeout !== 'undefined') {
        setTimeout(() => {
          restoreDreamSongScrollPosition(entry.nodeId!, entry.scrollPosition!);
        }, 100);
      } else {
        restoreDreamSongScrollPosition(entry.nodeId!, entry.scrollPosition!);
      }
    }

    return newState;
  }),

  // Flip animation actions
  setFlippedNode: (nodeId) => set((state: InterBrainState) => {
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

  startFlipAnimation: (nodeId, direction) => set((state: InterBrainState) => {
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

  completeFlipAnimation: (nodeId) => set((state: InterBrainState) => {
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
    const state = get() as InterBrainState;
    return state.flipState.flipStates.get(nodeId) || null;
  },
});

// ============================================================================
// STORE CREATION WITH SLICE COMPOSITION
// ============================================================================

// Helper to convert array to Map for persistence restoration
const arrayToMap = <K, V>(array: [K, V][]): Map<K, V> => new Map(array);

export const useInterBrainStore = create<InterBrainState>()(
  persist(
    (set, get, api) => ({
      // Compose all slices
      ...createCoreSlice(set, get),
      ...createSearchSlice(set, get, api),
      ...createConstellationSlice(set, get, api),
      ...createCopilotModeSlice(set, get, api),
      ...createEditModeSlice(set, get, api),
      ...createCreationSlice(set, get, api),
      ...createRadialButtonsSlice(set, get, api),
      ...createUpdatesSlice(set, get, api),
    }),
    {
      name: 'interbrain-storage',
      partialize: (state) => ({
        realNodes: [],
        ...extractSearchPersistenceData(state),
        ...extractConstellationPersistenceData(state),
      }),
      merge: (persisted: unknown, current) => {
        const persistedData = persisted as {
          realNodes: [string, RealNodeData][];
          constellationData?: {
            relationshipGraph: SerializableDreamSongGraph | null;
            lastScanTimestamp: number | null;
            isScanning: boolean;
            positions: [string, [number, number, number]][] | null;
            lastLayoutTimestamp: number | null;
            nodeMetadata: [string, { name: string; type: string; uuid: string }][] | null;
          } | null;
          vectorData?: [string, VectorData][];
          ollamaConfig?: OllamaConfig;
        };

        return {
          ...current,
          realNodes: persistedData.realNodes ? arrayToMap(persistedData.realNodes) : new Map(),
          ...restoreSearchPersistenceData(persistedData),
          ...restoreConstellationPersistenceData(persistedData),
        };
      },
    }
  )
);

// DIAGNOSTIC: Log all store updates (disabled but kept for debugging)
if (typeof window !== 'undefined') {
  useInterBrainStore.subscribe((_state, _prevState) => {
    // Diagnostic logging disabled
  });
}
