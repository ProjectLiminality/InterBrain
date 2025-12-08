import { StateCreator } from 'zustand';
import { DreamNode } from '../dreamnode';
import { VectorData } from './services/indexing-service';
import { OllamaConfig, DEFAULT_OLLAMA_CONFIG } from './types';

// Re-export types for convenience
export type { OllamaConfig, VectorData };
export { DEFAULT_OLLAMA_CONFIG };

/**
 * Search interface state
 */
export interface SearchInterfaceState {
  isActive: boolean;
  isSaving: boolean; // Track if save animation is in progress
  currentQuery: string;
  lastQuery: string; // For change detection
}

/**
 * Initial search interface state
 */
export const INITIAL_SEARCH_INTERFACE: SearchInterfaceState = {
  isActive: false,
  isSaving: false,
  currentQuery: '',
  lastQuery: ''
};

/**
 * Semantic search slice - owns all search-related state
 * This includes search results, search UI state, vector data, and Ollama config
 */
export interface SearchSlice {
  // Search results - populated by semantic search, consumed by multiple features
  searchResults: DreamNode[];
  setSearchResults: (results: DreamNode[]) => void;

  // Search interface state
  searchInterface: SearchInterfaceState;
  setSearchActive: (active: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchSaving: (saving: boolean) => void;

  // Vector data storage for semantic search (persisted)
  vectorData: Map<string, VectorData>;
  updateVectorData: (nodeId: string, data: VectorData) => void;
  deleteVectorData: (nodeId: string) => void;
  clearVectorData: () => void;

  // Ollama embedding configuration (persisted)
  ollamaConfig: OllamaConfig;
  setOllamaConfig: (config: Partial<OllamaConfig>) => void;
  resetOllamaConfig: () => void;
}

/**
 * Creates the search slice
 */
export const createSearchSlice: StateCreator<
  SearchSlice,
  [],
  [],
  SearchSlice
> = (set) => ({
  // Search results state
  searchResults: [],

  setSearchResults: (results) => set({ searchResults: results }),

  // Search interface state
  searchInterface: INITIAL_SEARCH_INTERFACE,

  setSearchActive: (active) => set(state => ({
    searchInterface: {
      ...state.searchInterface,
      isActive: active,
      // Clear query when deactivating for fresh start on reentry
      currentQuery: active ? state.searchInterface.currentQuery : '',
      lastQuery: active ? state.searchInterface.lastQuery : ''
    },
    // Also clear search results when deactivating
    searchResults: active ? state.searchResults : []
  })),

  setSearchQuery: (query) => set(state => ({
    searchInterface: {
      ...state.searchInterface,
      currentQuery: query
    }
  })),

  setSearchSaving: (saving) => set(state => ({
    searchInterface: {
      ...state.searchInterface,
      isSaving: saving
    }
  })),

  // Vector data state
  vectorData: new Map<string, VectorData>(),

  updateVectorData: (nodeId, data) => set(state => {
    const newVectorData = new Map(state.vectorData);
    newVectorData.set(nodeId, data);
    return { vectorData: newVectorData };
  }),

  deleteVectorData: (nodeId) => set(state => {
    const newVectorData = new Map(state.vectorData);
    newVectorData.delete(nodeId);
    return { vectorData: newVectorData };
  }),

  clearVectorData: () => set({ vectorData: new Map() }),

  // Ollama configuration state
  ollamaConfig: DEFAULT_OLLAMA_CONFIG,

  setOllamaConfig: (config) => set(state => ({
    ollamaConfig: { ...state.ollamaConfig, ...config }
  })),

  resetOllamaConfig: () => set({ ollamaConfig: DEFAULT_OLLAMA_CONFIG }),
});

/**
 * Extracts persistence data for the search slice
 */
export function extractSearchPersistenceData(state: SearchSlice) {
  return {
    vectorData: Array.from(state.vectorData.entries()),
    ollamaConfig: state.ollamaConfig,
  };
}

/**
 * Restores persistence data for the search slice
 */
export function restoreSearchPersistenceData(persistedData: {
  vectorData?: [string, VectorData][];
  ollamaConfig?: OllamaConfig;
}): Partial<SearchSlice> {
  return {
    vectorData: persistedData.vectorData ? new Map(persistedData.vectorData) : new Map(),
    ollamaConfig: persistedData.ollamaConfig || DEFAULT_OLLAMA_CONFIG,
  };
}
