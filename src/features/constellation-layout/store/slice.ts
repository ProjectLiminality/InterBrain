import { StateCreator } from 'zustand';
import {
  DreamSongRelationshipGraph,
  SerializableDreamSongGraph,
  serializeRelationshipGraph,
  deserializeRelationshipGraph
} from '../types';
import {
  FibonacciSphereConfig,
  DEFAULT_FIBONACCI_CONFIG
} from '../FibonacciSphereLayout';

// Re-export types for convenience
export type { DreamSongRelationshipGraph, SerializableDreamSongGraph, FibonacciSphereConfig };
export { DEFAULT_FIBONACCI_CONFIG, serializeRelationshipGraph, deserializeRelationshipGraph };

/**
 * Constellation data state
 */
export interface ConstellationDataState {
  relationshipGraph: DreamSongRelationshipGraph | null;
  lastScanTimestamp: number | null;
  isScanning: boolean;
  positions: Map<string, [number, number, number]> | null;
  lastLayoutTimestamp: number | null;
  // Lightweight node metadata for instant startup rendering
  nodeMetadata: Map<string, { name: string; type: string; uuid: string }> | null;
}

/**
 * Initial constellation data state
 */
export const INITIAL_CONSTELLATION_DATA: ConstellationDataState = {
  relationshipGraph: null,
  lastScanTimestamp: null,
  isScanning: false,
  positions: null,
  lastLayoutTimestamp: null,
  nodeMetadata: null
};

/**
 * Constellation slice - owns constellation layout and relationship graph state
 */
export interface ConstellationSlice {
  // DreamSong relationship graph state
  constellationData: ConstellationDataState;
  setRelationshipGraph: (graph: DreamSongRelationshipGraph | null) => void;
  setConstellationScanning: (scanning: boolean) => void;
  setConstellationPositions: (positions: Map<string, [number, number, number]> | null) => void;
  setNodeMetadata: (metadata: Map<string, { name: string; type: string; uuid: string }> | null) => void;
  clearConstellationData: () => void;

  // Fibonacci sphere layout configuration
  fibonacciConfig: FibonacciSphereConfig;
  setFibonacciConfig: (config: Partial<FibonacciSphereConfig>) => void;
  resetFibonacciConfig: () => void;

  // Debug flags for constellation visualization
  debugWireframeSphere: boolean;
  setDebugWireframeSphere: (visible: boolean) => void;
  debugIntersectionPoint: boolean;
  setDebugIntersectionPoint: (visible: boolean) => void;
}

/**
 * Creates the constellation slice
 */
export const createConstellationSlice: StateCreator<
  ConstellationSlice,
  [],
  [],
  ConstellationSlice
> = (set) => ({
  constellationData: INITIAL_CONSTELLATION_DATA,

  setRelationshipGraph: (graph) => set((state) => ({
    constellationData: {
      ...state.constellationData,
      relationshipGraph: graph,
      lastScanTimestamp: graph ? Date.now() : null,
      isScanning: false
    }
  })),

  setConstellationScanning: (scanning) => set((state) => ({
    constellationData: {
      ...state.constellationData,
      isScanning: scanning
    }
  })),

  setConstellationPositions: (positions) => set((state) => ({
    constellationData: {
      ...state.constellationData,
      positions,
      lastLayoutTimestamp: positions ? Date.now() : null
    }
  })),

  setNodeMetadata: (metadata) => set((state) => ({
    constellationData: {
      ...state.constellationData,
      nodeMetadata: metadata
    }
  })),

  clearConstellationData: () => set(() => ({
    constellationData: INITIAL_CONSTELLATION_DATA
  })),

  // Fibonacci sphere configuration
  fibonacciConfig: DEFAULT_FIBONACCI_CONFIG,

  setFibonacciConfig: (config) => set((state) => ({
    fibonacciConfig: { ...state.fibonacciConfig, ...config }
  })),

  resetFibonacciConfig: () => set({ fibonacciConfig: DEFAULT_FIBONACCI_CONFIG }),

  // Debug flags
  debugWireframeSphere: false,
  setDebugWireframeSphere: (visible) => set({ debugWireframeSphere: visible }),
  debugIntersectionPoint: false,
  setDebugIntersectionPoint: (visible) => set({ debugIntersectionPoint: visible }),
});

/**
 * Helper to convert Map to serializable format for persistence
 */
const mapToArray = <K, V>(map: Map<K, V>): [K, V][] => Array.from(map.entries());
const arrayToMap = <K, V>(array: [K, V][]): Map<K, V> => new Map(array);

/**
 * Extracts persistence data for the constellation slice
 */
export function extractConstellationPersistenceData(state: ConstellationSlice) {
  return {
    constellationData: (state.constellationData.relationshipGraph || state.constellationData.positions || state.constellationData.nodeMetadata) ? {
      ...state.constellationData,
      relationshipGraph: state.constellationData.relationshipGraph ?
        serializeRelationshipGraph(state.constellationData.relationshipGraph) : null,
      positions: state.constellationData.positions ?
        mapToArray(state.constellationData.positions) : null,
      nodeMetadata: state.constellationData.nodeMetadata ?
        mapToArray(state.constellationData.nodeMetadata) : null
    } : null,
  };
}

/**
 * Restores persistence data for the constellation slice
 */
export function restoreConstellationPersistenceData(persistedData: {
  constellationData?: {
    relationshipGraph: SerializableDreamSongGraph | null;
    lastScanTimestamp: number | null;
    isScanning: boolean;
    positions: [string, [number, number, number]][] | null;
    lastLayoutTimestamp: number | null;
    nodeMetadata: [string, { name: string; type: string; uuid: string }][] | null;
  } | null;
}): Partial<ConstellationSlice> {
  if (!persistedData.constellationData) {
    return { constellationData: INITIAL_CONSTELLATION_DATA };
  }

  try {
    return {
      constellationData: {
        relationshipGraph: persistedData.constellationData.relationshipGraph ?
          deserializeRelationshipGraph(persistedData.constellationData.relationshipGraph) : null,
        lastScanTimestamp: persistedData.constellationData.lastScanTimestamp,
        isScanning: false,
        positions: persistedData.constellationData.positions ?
          arrayToMap(persistedData.constellationData.positions) : null,
        lastLayoutTimestamp: persistedData.constellationData.lastLayoutTimestamp,
        nodeMetadata: persistedData.constellationData.nodeMetadata ?
          arrayToMap(persistedData.constellationData.nodeMetadata) : null
      }
    };
  } catch (error) {
    console.warn('Failed to deserialize constellation data:', error);
    return { constellationData: INITIAL_CONSTELLATION_DATA };
  }
}
