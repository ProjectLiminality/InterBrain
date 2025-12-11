import { StateCreator } from 'zustand';
import { DreamNode } from '../../dreamnode';
import type { SpatialLayoutMode } from '../../../core/store/interbrain-store';

/**
 * Copilot mode state types
 */
export interface CopilotModeState {
  isActive: boolean;
  conversationPartner: DreamNode | null; // The person node at center
  transcriptionFilePath: string | null; // Path to active transcription file
  showSearchResults: boolean; // Option key held state for showing/hiding results
  frozenSearchResults: DreamNode[]; // Snapshot of results when showing
  sharedNodeIds: string[]; // Track invoked nodes for post-call processing
}

/**
 * Initial state for copilot mode
 */
export const INITIAL_COPILOT_STATE: CopilotModeState = {
  isActive: false,
  conversationPartner: null,
  transcriptionFilePath: null,
  showSearchResults: false,
  frozenSearchResults: [],
  sharedNodeIds: []
};

/**
 * Copilot mode slice interface
 */
export interface CopilotModeSlice {
  copilotMode: CopilotModeState;
  startCopilotMode: (conversationPartner: DreamNode) => void;
  exitCopilotMode: () => void;
  setShowSearchResults: (show: boolean) => void;
  freezeSearchResults: () => void;
  addSharedNode: (nodeId: string) => void;
}

/**
 * Dependencies this slice needs from the combined store
 * These are provided by other slices (core, search)
 */
export interface CopilotSliceDependencies {
  // From core
  dreamNodes: Map<string, { node: DreamNode; lastSynced: number }>;
  selectedNode: DreamNode | null;
  spatialLayout: SpatialLayoutMode;
  setSpatialLayout: (layout: SpatialLayoutMode) => void;
  // From search slice
  searchResults: DreamNode[];
  setSearchResults: (results: DreamNode[]) => void;
}

/**
 * Combined type for the slice creator
 */
type CopilotSliceStore = CopilotModeSlice & CopilotSliceDependencies;

/**
 * Creates the copilot mode slice
 * Uses get() to access dependencies from other slices
 */
export const createCopilotModeSlice: StateCreator<
  CopilotSliceStore,
  [],
  [],
  CopilotModeSlice
> = (set, get) => ({
  copilotMode: INITIAL_COPILOT_STATE,

  startCopilotMode: (conversationPartner) => {
    // Hide ribbon for cleaner video call interface
    try {
      const app = (globalThis as any).app;
      if (app?.workspace?.leftRibbon) {
        app.workspace.leftRibbon.hide();
        console.log(`🎯 [Copilot-Entry] Hidden ribbon for cleaner interface`);
      }
    } catch (error) {
      console.warn('Failed to hide ribbon:', error);
    }

    // Pre-populate search results with conversation partner's related DreamNodes
    const state = get();
    const relatedNodeIds = conversationPartner.liminalWebConnections || [];

    const relatedNodes: DreamNode[] = [];
    for (const nodeId of relatedNodeIds) {
      const nodeData = state.dreamNodes.get(nodeId);
      if (nodeData) {
        relatedNodes.push(nodeData.node);
      }
    }

    console.log(`🎯 [Copilot] Starting conversation with "${conversationPartner.name}" (${relatedNodes.length} related nodes)`);

    set({
      copilotMode: {
        isActive: true,
        conversationPartner: { ...conversationPartner },
        transcriptionFilePath: null,
        showSearchResults: false,
        frozenSearchResults: relatedNodes,
        sharedNodeIds: []
      }
    } as Partial<CopilotSliceStore>);

    // Update cross-slice state: searchResults and spatialLayout
    // spatialLayout transition is the key signal that activates copilot-specific behaviors
    state.setSearchResults(relatedNodes);
    state.setSpatialLayout('copilot');
  },

  exitCopilotMode: () => {
    const state = get();
    const { conversationPartner, sharedNodeIds } = state.copilotMode;

    // Process shared nodes before clearing state
    if (conversationPartner && sharedNodeIds.length > 0) {
      const newRelationships = sharedNodeIds.filter(
        id => !conversationPartner.liminalWebConnections.includes(id)
      );

      if (newRelationships.length > 0) {
        console.log(`🔗 [Copilot] Adding ${newRelationships.length} new relationships for "${conversationPartner.name}"`);

        const updatedPartner = {
          ...conversationPartner,
          liminalWebConnections: [...conversationPartner.liminalWebConnections, ...newRelationships]
        };

        // Update the conversation partner node in store
        const existingNodeData = state.dreamNodes.get(conversationPartner.id);
        if (existingNodeData) {
          state.dreamNodes.set(conversationPartner.id, {
            ...existingNodeData,
            node: updatedPartner
          });
        }

        // Update bidirectional relationships in store for immediate UI feedback
        for (const sharedNodeId of newRelationships) {
          const sharedNodeData = state.dreamNodes.get(sharedNodeId);
          if (sharedNodeData) {
            const updatedSharedNode = {
              ...sharedNodeData.node,
              liminalWebConnections: [...sharedNodeData.node.liminalWebConnections, conversationPartner.id]
            };
            state.dreamNodes.set(sharedNodeId, {
              ...sharedNodeData,
              node: updatedSharedNode
            });
          }
        }
      }
    }

    // Show ribbon again
    try {
      const app = (globalThis as any).app;
      if (app?.workspace?.leftRibbon) {
        app.workspace.leftRibbon.show();
      }
    } catch (error) {
      console.warn('Failed to show ribbon:', error);
    }

    // Transition layout back to liminal-web before clearing copilot state
    state.setSpatialLayout('liminal-web');

    set({
      copilotMode: INITIAL_COPILOT_STATE
    } as Partial<CopilotSliceStore>);
  },

  setShowSearchResults: (show: boolean) => set((state) => ({
    copilotMode: {
      ...state.copilotMode,
      showSearchResults: show
    }
  } as Partial<CopilotSliceStore>)),

  freezeSearchResults: () => {
    const state = get();
    set({
      copilotMode: {
        ...state.copilotMode,
        frozenSearchResults: [...state.searchResults]
      }
    } as Partial<CopilotSliceStore>);
  },

  addSharedNode: (nodeId: string) => set((state) => ({
    copilotMode: {
      ...state.copilotMode,
      sharedNodeIds: [...state.copilotMode.sharedNodeIds, nodeId]
    }
  } as Partial<CopilotSliceStore>)),
});

/**
 * Re-export types for convenience
 */
export type { DreamNode };
