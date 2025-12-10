import { StateCreator } from 'zustand';
import { DreamNode } from '../../dreamnode';

/**
 * Edit mode validation errors
 */
export interface EditModeValidationErrors {
  title?: string;
  dreamTalk?: string;
  relationships?: string;
}

/**
 * Edit mode state types
 */
export interface EditModeState {
  isActive: boolean;
  editingNode: DreamNode | null;
  originalRelationships: string[]; // Store original relationships for cancel operation
  pendingRelationships: string[]; // Track relationship changes
  searchResults: DreamNode[]; // Search results for relationship discovery
  validationErrors: EditModeValidationErrors; // Validation errors for edit mode
  newDreamTalkFile?: globalThis.File; // New media file for DreamTalk editing
  isSearchingRelationships: boolean; // Toggle state for relationship search interface
}

/**
 * Initial state for edit mode
 */
export const INITIAL_EDIT_MODE_STATE: EditModeState = {
  isActive: false,
  editingNode: null,
  originalRelationships: [],
  pendingRelationships: [],
  searchResults: [],
  validationErrors: {},
  isSearchingRelationships: false
};

/**
 * Edit mode slice interface
 */
export interface EditModeSlice {
  editMode: EditModeState;
  startEditMode: (node: DreamNode) => void;
  exitEditMode: () => void;
  updateEditingNodeMetadata: (updates: Partial<DreamNode>) => void;
  setEditModeNewDreamTalkFile: (file: globalThis.File | undefined) => void;
  setEditModeSearchResults: (results: DreamNode[]) => void;
  setEditModeSearchActive: (active: boolean) => void;
  togglePendingRelationship: (nodeId: string) => void;
  savePendingRelationships: () => void;
  setEditModeValidationErrors: (errors: EditModeValidationErrors) => void;
}

/**
 * Dependencies this slice needs from the combined store
 */
export interface EditModeSliceDependencies {
  // From search slice - needed for clearing search results on edit-search exit
  searchResults: DreamNode[];
}

/**
 * Combined type for the slice creator
 */
type EditModeSliceStore = EditModeSlice & EditModeSliceDependencies;

/**
 * Creates the edit mode slice
 */
export const createEditModeSlice: StateCreator<
  EditModeSliceStore,
  [],
  [],
  EditModeSlice
> = (set) => ({
  editMode: INITIAL_EDIT_MODE_STATE,

  startEditMode: (node) => set(() => ({
    editMode: {
      isActive: true,
      editingNode: { ...node }, // Create a copy to avoid mutations
      originalRelationships: [...node.liminalWebConnections],
      pendingRelationships: [...node.liminalWebConnections],
      searchResults: [],
      validationErrors: {},
      isSearchingRelationships: false
    }
  } as Partial<EditModeSliceStore>)),

  exitEditMode: () => set(() => ({
    editMode: INITIAL_EDIT_MODE_STATE
  } as Partial<EditModeSliceStore>)),

  updateEditingNodeMetadata: (updates) => set((state) => ({
    editMode: {
      ...state.editMode,
      editingNode: state.editMode.editingNode
        ? { ...state.editMode.editingNode, ...updates }
        : null
    }
  } as Partial<EditModeSliceStore>)),

  setEditModeNewDreamTalkFile: (file) => set((state) => ({
    editMode: {
      ...state.editMode,
      newDreamTalkFile: file
    }
  } as Partial<EditModeSliceStore>)),

  setEditModeSearchResults: (results) => set((state) => ({
    editMode: {
      ...state.editMode,
      searchResults: results
    }
  } as Partial<EditModeSliceStore>)),

  setEditModeSearchActive: (active) => set((state) => ({
    editMode: {
      ...state.editMode,
      isSearchingRelationships: active,
      // Clear search results when exiting edit-search mode to prevent persistence
      searchResults: active ? state.editMode.searchResults : []
    },
    // Also clear main search results when exiting edit-search to clean up spatial layout
    searchResults: active ? state.searchResults : []
  } as Partial<EditModeSliceStore>)),

  togglePendingRelationship: (nodeId) => set((state) => {
    const currentPending = state.editMode.pendingRelationships;
    const isAlreadyPending = currentPending.includes(nodeId);

    return {
      editMode: {
        ...state.editMode,
        pendingRelationships: isAlreadyPending
          ? currentPending.filter(id => id !== nodeId)
          : [...currentPending, nodeId]
      }
    } as Partial<EditModeSliceStore>;
  }),

  savePendingRelationships: () => set((state) => {
    if (!state.editMode.editingNode) return {} as Partial<EditModeSliceStore>;

    const updatedNode = {
      ...state.editMode.editingNode,
      liminalWebConnections: [...state.editMode.pendingRelationships]
    };

    return {
      editMode: {
        ...state.editMode,
        editingNode: updatedNode,
        originalRelationships: [...state.editMode.pendingRelationships]
      }
    } as Partial<EditModeSliceStore>;
  }),

  setEditModeValidationErrors: (errors) => set((state) => ({
    editMode: {
      ...state.editMode,
      validationErrors: errors
    }
  } as Partial<EditModeSliceStore>)),
});

/**
 * Re-export types for convenience
 */
export type { DreamNode };
