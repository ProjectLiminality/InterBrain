import { StateCreator } from 'zustand';
import { VectorData } from '../core/services/indexing-service';
import { OllamaConfig, DEFAULT_OLLAMA_CONFIG } from '../types';

// Re-export OllamaConfig type for use in main store
export type { OllamaConfig };

/**
 * Ollama configuration and vector data slice for the main store
 * This slice manages semantic search related state
 */
export interface OllamaConfigSlice {
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
 * Creates the Ollama configuration slice
 * This should be integrated into the main store using Zustand's slice pattern
 */
export const createOllamaConfigSlice: StateCreator<
  OllamaConfigSlice,
  [],
  [],
  OllamaConfigSlice
> = (set, _get, _api) => ({
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
 * Helper functions for store integration
 */

/**
 * Extracts persistence data for the Ollama config slice
 */
export function extractOllamaPersistenceData(state: OllamaConfigSlice) {
  return {
    vectorData: Array.from(state.vectorData.entries()),
    ollamaConfig: state.ollamaConfig,
  };
}

/**
 * Restores persistence data for the Ollama config slice
 */
export function restoreOllamaPersistenceData(persistedData: {
  vectorData?: [string, VectorData][];
  ollamaConfig?: OllamaConfig;
}): Partial<OllamaConfigSlice> {
  return {
    vectorData: persistedData.vectorData ? new Map(persistedData.vectorData) : new Map(),
    ollamaConfig: persistedData.ollamaConfig || DEFAULT_OLLAMA_CONFIG,
  };
}

/**
 * Type guard to check if state has Ollama config slice
 */
export function hasOllamaConfigSlice(state: unknown): state is OllamaConfigSlice {
  const typedState = state as Record<string, unknown>;
  return (
    typedState &&
    typeof typedState.vectorData !== 'undefined' &&
    typeof typedState.ollamaConfig !== 'undefined' &&
    typeof typedState.setOllamaConfig === 'function'
  );
}