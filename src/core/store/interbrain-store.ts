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
 * - DreamweavingSlice: selectedNodeDreamSongData, dreamSongCache, dreamSongRelationships
 * - DreamNodeSlice: flipState, creatorMode
 * - SearchSlice: searchResults, searchInterface, vectorData, ollamaConfig
 * - ConstellationSlice: constellationData (positions, layout config), fibonacciConfig, debug flags
 * - CopilotModeSlice: copilotMode state and actions
 * - EditModeSlice: editMode state and actions
 * - CreationSlice: creationState and actions
 * - RadialButtonsSlice: radialButtonUI
 * - UpdatesSlice: updateStatus
 * - DragAndDropSlice: isDragging
 * - LiminalWebSlice: selectedNode, navigationHistory
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { CONSTELLATION_DEFAULTS } from '../../features/constellation-layout/constants';
// Feature slice imports
import {
  DreamweavingSlice,
  createDreamweavingSlice,
  extractDreamweavingPersistenceData,
  restoreDreamweavingPersistenceData,
  SerializableDreamSongGraph as DreamweavingSerializableGraph,
} from '../../features/dreamweaving/store/slice';

import {
  DreamNodeSlice,
  createDreamNodeSlice,
  DreamNodeData,
  extractDreamNodePersistenceData,
  restoreDreamNodePersistenceData,
} from '../../features/dreamnode/store/slice';

import {
  SearchSlice,
  createSearchSlice,
  extractSearchPersistenceData,
  restoreSearchPersistenceData,
  SearchInterfaceState,
} from '../../features/semantic-search/store/slice';
import type { OllamaConfig } from '../../features/semantic-search/store/slice';
import { VectorData } from '../../features/semantic-search/services/indexing-service';

import {
  ConstellationSlice,
  createConstellationSlice,
  extractConstellationPersistenceData,
  restoreConstellationPersistenceData,
  SerializableDreamSongGraph,
} from '../../features/constellation-layout/store/slice';

import {
  CopilotModeSlice,
  createCopilotModeSlice,
  CopilotModeState,
} from '../../features/conversational-copilot/store/slice';

import {
  EditModeSlice,
  createEditModeSlice,
  EditModeState,
  EditModeValidationErrors,
} from '../../features/dreamnode-editor/store/slice';

import {
  CreationSlice,
  createCreationSlice,
  CreationState,
  DraftDreamNode,
  ValidationErrors,
} from '../../features/dreamnode-creator/store/slice';

import {
  RadialButtonsSlice,
  createRadialButtonsSlice,
} from '../../features/action-buttons/store/slice';

import {
  UpdatesSlice,
  createUpdatesSlice,
} from '../../features/dreamnode-updater/store/slice';

import {
  DragAndDropSlice,
  createDragAndDropSlice,
} from '../../features/drag-and-drop/store/slice';

import {
  LiminalWebSlice,
  createLiminalWebSlice,
  NavigationHistoryEntry,
  NavigationHistoryState,
} from '../../features/liminal-web-layout/store/slice';

import {
  FeedbackSlice,
  createFeedbackSlice,
  extractFeedbackPersistenceData,
  restoreFeedbackPersistenceData,
  FeedbackState,
  AutoReportPreference,
} from '../../features/feedback/store/slice';

import {
  TutorialSlice,
  createTutorialSlice,
  extractTutorialPersistenceData,
  restoreTutorialPersistenceData,
} from '../../features/tutorial/store/slice';

// Type alias for spatial layout modes (the active view mode)
// Note: 'edit' is for metadata editing, 'relationship-edit' is for relationship editing (peer-level modes)
export type SpatialLayoutMode = 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'relationship-edit' | 'copilot';

// ============================================================================
// CONSTELLATION FILTERING TYPES
// ============================================================================

/**
 * Configuration for constellation filtering - controls how many nodes load at startup
 */
export interface ConstellationConfig {
  /** Maximum nodes to mount in constellation view */
  maxNodes: number;
  /** Whether to prioritize larger clusters when selecting nodes */
  prioritizeClusters: boolean;
}

/**
 * Result of constellation filtering - categorizes nodes by their mounting behavior
 */
export interface ConstellationFilterResult {
  /** VIP seats: Nodes connected by edges (constellation members) - always mounted */
  vipNodes: Set<string>;
  /** Standing room: DreamSong owners (from edge.dreamSongPath) - always mounted */
  parentNodes: Set<string>;
  /** General admission: Random sample to fill remaining slots */
  sampledNodes: Set<string>;
  /** Ephemeral: Everything else - spawned on-demand, not mounted at startup */
  ephemeralNodes: Set<string>;
  /** Combined set of all mounted nodes (vip + parent + sampled) for quick lookup */
  mountedNodes: Set<string>;
}

/**
 * State for dynamically spawned ephemeral nodes
 */
export interface EphemeralNodeState {
  /** Position where the node spawns from (radially outward from target) */
  spawnPosition: [number, number, number];
  /** Target position the node animates to */
  targetPosition: [number, number, number];
  /** Timestamp when node was mounted */
  mountedAt: number;
}

// Re-export types for backward compatibility
export type { CopilotModeState };
export type { EditModeState, EditModeValidationErrors };
export type { CreationState, DraftDreamNode, ValidationErrors };
export type { SearchInterfaceState };
export type { NavigationHistoryEntry, NavigationHistoryState };
export type { FeedbackState, AutoReportPreference };

// ============================================================================
// CORE STATE TYPES
// ============================================================================

// Re-export DreamNodeData from dreamnode store slice (was RealNodeData)
export type { DreamNodeData };

// Backward compatibility alias - use DreamNodeData in new code
export type RealNodeData = DreamNodeData;

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
  // Backward compatibility aliases for realNodes (now lives in DreamNodeSlice as dreamNodes)
  // These are computed getters/setters that delegate to dreamNodes
  // TODO: Migrate all usages to use dreamNodes directly, then remove these
  realNodes: Map<string, DreamNodeData>;
  setRealNodes: (nodes: Map<string, DreamNodeData>) => void;
  updateRealNode: (id: string, data: DreamNodeData) => void;
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

  // Constellation filtering - controls which nodes mount at startup
  constellationConfig: ConstellationConfig;
  setConstellationConfig: (config: Partial<ConstellationConfig>) => void;
  constellationFilter: ConstellationFilterResult;
  setConstellationFilter: (filter: ConstellationFilterResult) => void;

  // Ephemeral nodes - dynamically spawned nodes not in the constellation
  ephemeralNodes: Map<string, EphemeralNodeState>;
  spawnEphemeralNode: (nodeId: string, targetPosition: [number, number, number], spawnPosition: [number, number, number]) => void;
  spawnEphemeralNodesBatch: (nodes: Array<{ nodeId: string; targetPosition: [number, number, number]; spawnPosition: [number, number, number] }>) => void;
  despawnEphemeralNode: (nodeId: string) => void;
  clearEphemeralNodes: () => void;
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
  LiminalWebSlice,
  FeedbackSlice,
  TutorialSlice {}

// ============================================================================
// CORE SLICE CREATOR
// ============================================================================

const createCoreSlice = (set: any, _get: any): CoreSlice => ({
  // Backward compatibility: realNodes is kept in sync with dreamNodes
  // Both point to the same data - realNodes exists for legacy code
  // TODO: Migrate all usages to dreamNodes, then remove realNodes
  realNodes: new Map<string, DreamNodeData>(),

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

  // Constellation filtering defaults
  constellationConfig: {
    maxNodes: CONSTELLATION_DEFAULTS.MAX_NODES,
    prioritizeClusters: CONSTELLATION_DEFAULTS.PRIORITIZE_CLUSTERS,
  },

  constellationFilter: {
    vipNodes: new Set<string>(),
    parentNodes: new Set<string>(),
    sampledNodes: new Set<string>(),
    ephemeralNodes: new Set<string>(),
    mountedNodes: new Set<string>(),
  },

  // Ephemeral nodes (spawned on-demand)
  ephemeralNodes: new Map<string, EphemeralNodeState>(),

  // Actions - update both dreamNodes and realNodes for backward compatibility
  setRealNodes: (nodes) => set({ dreamNodes: nodes, realNodes: nodes }),

  updateRealNode: (id, data) => set((state: InterBrainState) => {
    const newMap = new Map(state.dreamNodes);
    newMap.set(id, data);
    return { dreamNodes: newMap, realNodes: newMap };
  }),

  batchUpdateNodePositions: (positions) => set((state: InterBrainState) => {
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
    return { dreamNodes: newMap, realNodes: newMap };
  }),

  deleteRealNode: (id) => set((state: InterBrainState) => {
    const newMap = new Map(state.dreamNodes);
    newMap.delete(id);
    return { dreamNodes: newMap, realNodes: newMap };
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

  // Constellation filtering actions
  setConstellationConfig: (config) => set((state: InterBrainState) => ({
    constellationConfig: { ...state.constellationConfig, ...config }
  })),

  setConstellationFilter: (filter) => set({ constellationFilter: filter }),

  // Ephemeral node actions
  spawnEphemeralNode: (nodeId, targetPosition, spawnPosition) => set((state: InterBrainState) => {
    const newMap = new Map(state.ephemeralNodes);
    newMap.set(nodeId, {
      spawnPosition,
      targetPosition,
      mountedAt: Date.now(),
    });
    return { ephemeralNodes: newMap };
  }),

  spawnEphemeralNodesBatch: (nodes) => set((state: InterBrainState) => {
    const newMap = new Map(state.ephemeralNodes);
    for (const { nodeId, targetPosition, spawnPosition } of nodes) {
      if (!newMap.has(nodeId)) {
        newMap.set(nodeId, {
          spawnPosition,
          targetPosition,
          mountedAt: Date.now(),
        });
      }
    }
    return { ephemeralNodes: newMap };
  }),

  despawnEphemeralNode: (nodeId) => set((state: InterBrainState) => {
    console.log(`[LIFECYCLE] ${nodeId.slice(0,8)}: despawnEphemeralNode, remaining=${state.ephemeralNodes.size - 1}`);
    const newMap = new Map(state.ephemeralNodes);
    newMap.delete(nodeId);
    return { ephemeralNodes: newMap };
  }),

  clearEphemeralNodes: () => set({ ephemeralNodes: new Map<string, EphemeralNodeState>() }),
});

// ============================================================================
// STORE CREATION WITH SLICE COMPOSITION
// ============================================================================

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
      ...createFeedbackSlice(set, get, api),
      ...createTutorialSlice(set, get),
    }),
    {
      name: 'interbrain-storage',
      storage: createJSONStorage(() => indexedDB),
      partialize: (state) => ({
        ...extractDreamNodePersistenceData(state),
        ...extractSearchPersistenceData(state),
        ...extractConstellationPersistenceData(state),
        ...extractDreamweavingPersistenceData(state),
        ...extractFeedbackPersistenceData(state),
        ...extractTutorialPersistenceData(state),
      }),
      merge: (persisted: unknown, current) => {
        const persistedData = persisted as {
          dreamNodes?: [string, DreamNodeData][];
          // Legacy field - will be migrated to dreamNodes
          realNodes?: [string, DreamNodeData][];
          constellationData?: {
            relationshipGraph: SerializableDreamSongGraph | null;
            lastScanTimestamp: number | null;
            isScanning: boolean;
            positions: [string, [number, number, number]][] | null;
            lastLayoutTimestamp: number | null;
            nodeMetadata: [string, { name: string; type: string; uuid: string }][] | null;
          } | null;
          // DreamSong relationships (from dreamweaving slice)
          dreamSongRelationships?: {
            graph: DreamweavingSerializableGraph | null;
            lastScanTimestamp: number | null;
            isScanning: boolean;
          } | null;
          vectorData?: [string, VectorData][];
          ollamaConfig?: OllamaConfig;
          feedbackPreferences?: {
            autoReportPreference?: AutoReportPreference;
            includeLogs?: boolean;
            includeState?: boolean;
          };
          // Tutorial completion state
          hasCompleted?: boolean;
        };

        // Support migration from legacy realNodes to dreamNodes
        const dreamNodesData = persistedData.dreamNodes || persistedData.realNodes;
        const restoredDreamNodes = restoreDreamNodePersistenceData({ dreamNodes: dreamNodesData });

        return {
          ...current,
          ...restoredDreamNodes,
          // Keep realNodes in sync with dreamNodes for backward compatibility
          realNodes: restoredDreamNodes.dreamNodes,
          ...restoreSearchPersistenceData(persistedData),
          ...restoreConstellationPersistenceData(persistedData),
          ...restoreDreamweavingPersistenceData(persistedData),
          ...restoreFeedbackPersistenceData(persistedData),
          ...restoreTutorialPersistenceData(current as TutorialSlice, persistedData),
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
