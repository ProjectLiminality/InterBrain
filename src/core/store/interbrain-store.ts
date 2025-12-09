/**
 * InterBrain Store - Core state management with slice composition
 *
 * This store combines minimal core state with feature-specific slices.
 * Each feature owns its state in its respective slice file.
 *
 * Core State (lives here):
 * - realNodes: Fundamental DreamNode data
 * - spatialLayout: Which mode is active (view layer orchestration)
 * - camera: 3D view state
 * - layoutTransition: Animation state between layouts
 * - debugFlyingControls: Camera debug flag
 *
 * Feature Slices (imported from features/):
 * - DreamweavingSlice: selectedNodeDreamSongData, dreamSongCache
 * - DreamNodeSlice: flipState, creatorMode
 * - SearchSlice: searchResults, searchInterface, vectorData, ollamaConfig
 * - ConstellationSlice: constellationData, fibonacciConfig, debug flags
 * - CopilotModeSlice: copilotMode state and actions
 * - EditModeSlice: editMode state and actions
 * - CreationSlice: creationState and actions
 * - RadialButtonsSlice: radialButtonUI
 * - UpdatesSlice: updateStatus
 * - DragAndDropSlice: isDragging
 * - LiminalWebSlice: selectedNode, navigationHistory
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DreamNode } from '../../features/dreamnode/types/dreamnode';

// Feature slice imports
import {
  DreamweavingSlice,
  createDreamweavingSlice,
} from '../../features/dreamweaving/dreamweaving-slice';

import {
  DreamNodeSlice,
  createDreamNodeSlice,
} from '../../features/dreamnode/dreamnode-slice';

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

import {
  DragAndDropSlice,
  createDragAndDropSlice,
} from '../../features/drag-and-drop/drag-and-drop-slice';

import {
  LiminalWebSlice,
  createLiminalWebSlice,
  NavigationHistoryEntry,
  NavigationHistoryState,
} from '../../features/liminal-web-layout/liminal-web-slice';

// Type alias for spatial layout modes (the active view mode)
export type SpatialLayoutMode = 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'edit-search' | 'copilot';

// Re-export types for backward compatibility
export type { CopilotModeState };
export type { EditModeState, EditModeValidationErrors };
export type { CreationState, ProtoNode, ValidationErrors };
export type { SearchInterfaceState };
export type { NavigationHistoryEntry, NavigationHistoryState };

// ============================================================================
// CORE STATE TYPES
// ============================================================================

export interface RealNodeData {
  node: DreamNode;
  fileHash?: string;
  lastSynced: number;
}

/**
 * Navigation Request - Declarative way for features to request spatial navigation
 *
 * Features write navigation requests to the store, and the SpatialOrchestrator
 * reacts to them. This is the universal pattern for feature → core communication.
 */
export interface NavigationRequest {
  type: 'focus' | 'constellation' | 'applyLayout';
  nodeId?: string;
  interrupt?: boolean; // Use interrupt variants for mid-flight changes
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

  // Spatial layout state (view layer orchestration)
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
    previousLayout: SpatialLayoutMode | null;
  };
  setLayoutTransition: (isTransitioning: boolean, progress?: number, previousLayout?: SpatialLayoutMode | null) => void;

  // Camera debug flag (stays in core - camera is view layer)
  debugFlyingControls: boolean;
  setDebugFlyingControls: (enabled: boolean) => void;

  // Navigation request (feature → core communication)
  navigationRequest: NavigationRequest | null;
  requestNavigation: (request: NavigationRequest) => void;
  clearNavigationRequest: () => void;
}

// ============================================================================
// COMBINED STATE TYPE
// ============================================================================

export interface InterBrainState extends
  CoreSlice,
  DreamweavingSlice,
  DreamNodeSlice,
  SearchSlice,
  ConstellationSlice,
  CopilotModeSlice,
  EditModeSlice,
  CreationSlice,
  RadialButtonsSlice,
  UpdatesSlice,
  DragAndDropSlice,
  LiminalWebSlice {}

// ============================================================================
// CORE SLICE CREATOR
// ============================================================================

const createCoreSlice = (set: any, _get: any): CoreSlice => ({
  // Initial state
  realNodes: new Map<string, RealNodeData>(),

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

  debugFlyingControls: false,

  navigationRequest: null,

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

  setSpatialLayout: (layout) => set((state: InterBrainState) => {
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

  setDebugFlyingControls: (enabled) => set({ debugFlyingControls: enabled }),

  requestNavigation: (request) => set({ navigationRequest: request }),

  clearNavigationRequest: () => set({ navigationRequest: null }),
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
      ...createDreamweavingSlice(set, get, api),
      ...createDreamNodeSlice(set, get, api),
      ...createSearchSlice(set, get, api),
      ...createConstellationSlice(set, get, api),
      ...createCopilotModeSlice(set, get, api),
      ...createEditModeSlice(set, get, api),
      ...createCreationSlice(set, get, api),
      ...createRadialButtonsSlice(set, get, api),
      ...createUpdatesSlice(set, get, api),
      ...createDragAndDropSlice(set, get, api),
      ...createLiminalWebSlice(set, get, api),
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
