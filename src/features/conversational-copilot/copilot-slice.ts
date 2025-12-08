import { StateCreator } from 'zustand';
import { DreamNode } from '../../core/types/dreamnode';
import type { SpatialLayoutMode } from '../../core/store/interbrain-store';

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
  realNodes: Map<string, { node: DreamNode; lastSynced: number }>;
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
    console.log(`🎯 [Copilot-Entry] Conversation partner "${conversationPartner.name}" has ${relatedNodeIds.length} liminalWebConnections:`, relatedNodeIds);

    const relatedNodes: DreamNode[] = [];

    for (const nodeId of relatedNodeIds) {
      const nodeData = state.realNodes.get(nodeId);
      if (nodeData) {
        relatedNodes.push(nodeData.node);
        console.log(`🎯 [Copilot-Entry] ✓ Found node: ${nodeData.node.name} (${nodeId})`);
      } else {
        console.log(`🎯 [Copilot-Entry] ✗ Node not found in realNodes: ${nodeId}`);
      }
    }

    console.log(`🎯 [Copilot-Entry] Pre-populated ${relatedNodes.length} related nodes from liminal-web`);
    console.log(`🎯 [Copilot-Entry] Related node names:`, relatedNodes.map(n => n.name));

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

    // Also update searchResults (from search slice) and spatialLayout (from core)
    // These are set separately since they belong to other slices
    state.setSearchResults(relatedNodes);
  },

  exitCopilotMode: () => {
    const state = get();
    const { conversationPartner, sharedNodeIds } = state.copilotMode;

    // Process shared nodes before clearing state
    if (conversationPartner && sharedNodeIds.length > 0) {
      console.log(`🔗 [Copilot-Exit] Processing ${sharedNodeIds.length} shared nodes for "${conversationPartner.name}"`);
      console.log(`🔗 [Copilot-Exit] Shared node IDs: ${sharedNodeIds.join(', ')}`);

      const newRelationships = sharedNodeIds.filter(
        id => !conversationPartner.liminalWebConnections.includes(id)
      );

      if (newRelationships.length > 0) {
        const updatedPartner = {
          ...conversationPartner,
          liminalWebConnections: [...conversationPartner.liminalWebConnections, ...newRelationships]
        };

        console.log(`✅ [Copilot-Exit] Adding ${newRelationships.length} new relationships: ${newRelationships.join(', ')}`);
        console.log(`✅ [Copilot-Exit] "${conversationPartner.name}" now has ${updatedPartner.liminalWebConnections.length} total relationships`);

        // Update the conversation partner node in store
        const existingNodeData = state.realNodes.get(conversationPartner.id);
        if (existingNodeData) {
          state.realNodes.set(conversationPartner.id, {
            ...existingNodeData,
            node: updatedPartner
          });
        }

        // Update bidirectional relationships in store for immediate UI feedback
        for (const sharedNodeId of newRelationships) {
          const sharedNodeData = state.realNodes.get(sharedNodeId);
          if (sharedNodeData) {
            const updatedSharedNode = {
              ...sharedNodeData.node,
              liminalWebConnections: [...sharedNodeData.node.liminalWebConnections, conversationPartner.id]
            };
            state.realNodes.set(sharedNodeId, {
              ...sharedNodeData,
              node: updatedSharedNode
            });
            console.log(`✅ [Copilot-Exit] Updated bidirectional relationship for shared node: ${updatedSharedNode.name}`);
          }
        }
      } else {
        console.log(`ℹ️ [Copilot-Exit] No new relationships to add - all shared nodes were already related`);
      }
    }

    // Show ribbon again
    try {
      const app = (globalThis as any).app;
      if (app?.workspace?.leftRibbon) {
        app.workspace.leftRibbon.show();
        console.log(`🎯 [Copilot-Exit] Restored ribbon visibility`);
      }
    } catch (error) {
      console.warn('Failed to show ribbon:', error);
    }

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
