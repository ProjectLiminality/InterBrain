import { StateCreator } from 'zustand';
import {
  FibonacciSphereConfig,
  DEFAULT_FIBONACCI_CONFIG
} from '../utils/FibonacciSphereLayout';

// Re-export types for convenience
export type { FibonacciSphereConfig };
export { DEFAULT_FIBONACCI_CONFIG };

// Re-export relationship types from dreamweaving (the source of truth)
export type {
  DreamSongRelationshipGraph,
  SerializableDreamSongGraph,
} from '../../dreamweaving/types/relationship';
export {
  serializeRelationshipGraph,
  deserializeRelationshipGraph
} from '../../dreamweaving/types/relationship';

/**
 * Constellation layout state
 * Note: Relationship graph data is owned by dreamweaving slice, not here.
 * This slice only owns computed positions and layout configuration.
 */
export interface ConstellationLayoutState {
  /** Computed positions from layout algorithm */
  positions: Map<string, [number, number, number]> | null;
  /** Timestamp of last layout computation */
  lastLayoutTimestamp: number | null;
  /** Lightweight node metadata for instant startup rendering */
  nodeMetadata: Map<string, { name: string; type: string; uuid: string }> | null;
  /** Hash of the graph when positions were computed (for cache validation) */
  graphHashWhenPositionsComputed: string | null;
}

/**
 * Initial constellation layout state
 */
export const INITIAL_CONSTELLATION_LAYOUT: ConstellationLayoutState = {
  positions: null,
  lastLayoutTimestamp: null,
  nodeMetadata: null,
  graphHashWhenPositionsComputed: null
};

/**
 * Constellation slice - owns layout positions and configuration
 * Note: Relationship graph data is read from dreamweaving slice, not stored here.
 */
export interface ConstellationSlice {
  // Layout positions and metadata (computed from relationship graph)
  constellationData: ConstellationLayoutState;
  setConstellationPositions: (positions: Map<string, [number, number, number]> | null) => void;
  setNodeMetadata: (metadata: Map<string, { name: string; type: string; uuid: string }> | null) => void;
  setGraphHashWhenPositionsComputed: (hash: string | null) => void;
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
  debugEphemeralRing: boolean;
  setDebugEphemeralRing: (visible: boolean) => void;
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
  constellationData: INITIAL_CONSTELLATION_LAYOUT,

  setConstellationPositions: (positions) => {

    // Store a COPY of the Map to prevent external mutation
    const positionsCopy = positions ? new Map(positions) : null;

    return set((state) => ({
      constellationData: {
        ...state.constellationData,
        positions: positionsCopy,
        lastLayoutTimestamp: positionsCopy ? Date.now() : null
      }
    }));
  },

  setNodeMetadata: (metadata) => set((state) => ({
    constellationData: {
      ...state.constellationData,
      nodeMetadata: metadata
    }
  })),

  setGraphHashWhenPositionsComputed: (hash) => set((state) => ({
    constellationData: {
      ...state.constellationData,
      graphHashWhenPositionsComputed: hash
    }
  })),

  clearConstellationData: () => set(() => ({
    constellationData: INITIAL_CONSTELLATION_LAYOUT
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
  debugEphemeralRing: false,
  setDebugEphemeralRing: (visible) => set({ debugEphemeralRing: visible }),
});

/**
 * Helper to convert Map to serializable format for persistence
 */
const mapToArray = <K, V>(map: Map<K, V>): [K, V][] => Array.from(map.entries());
const arrayToMap = <K, V>(array: [K, V][]): Map<K, V> => new Map(array);

/**
 * Extracts persistence data for the constellation slice (positions only)
 */
export function extractConstellationPersistenceData(state: ConstellationSlice) {
  return {
    constellationData: (state.constellationData.positions || state.constellationData.nodeMetadata) ? {
      positions: state.constellationData.positions ?
        mapToArray(state.constellationData.positions) : null,
      lastLayoutTimestamp: state.constellationData.lastLayoutTimestamp,
      nodeMetadata: state.constellationData.nodeMetadata ?
        mapToArray(state.constellationData.nodeMetadata) : null,
      graphHashWhenPositionsComputed: state.constellationData.graphHashWhenPositionsComputed
    } : null,
  };
}

/**
 * Restores persistence data for the constellation slice
 */
export function restoreConstellationPersistenceData(persistedData: {
  constellationData?: {
    positions: [string, [number, number, number]][] | null;
    lastLayoutTimestamp: number | null;
    nodeMetadata: [string, { name: string; type: string; uuid: string }][] | null;
    graphHashWhenPositionsComputed?: string | null;
    // Legacy fields for migration (will be ignored, data now in dreamweaving slice)
    relationshipGraph?: unknown;
    lastScanTimestamp?: unknown;
    isScanning?: unknown;
  } | null;
}): Partial<ConstellationSlice> {
  if (!persistedData.constellationData) {
    return { constellationData: INITIAL_CONSTELLATION_LAYOUT };
  }

  try {
    const positionsArray = persistedData.constellationData.positions;
    const graphHash = persistedData.constellationData.graphHashWhenPositionsComputed ?? null;

    let positionsMap = positionsArray ? arrayToMap(positionsArray) : null;

    // CRITICAL: Validate that position values are actual coordinate arrays with real numbers
    // Corrupted data can be: null, undefined, or [null, null, null]
    if (positionsMap) {
      const firstKey = Array.from(positionsMap.keys())[0];
      const firstValue = positionsMap.get(firstKey);

      // Check if values are corrupted (null, undefined, or arrays with null elements)
      const isCorrupted = !firstValue ||
        !Array.isArray(firstValue) ||
        firstValue.length !== 3 ||
        firstValue.some(v => v === null || v === undefined || !Number.isFinite(v));

      if (isCorrupted) {
        positionsMap = null;
      }
    }

    return {
      constellationData: {
        positions: positionsMap,
        lastLayoutTimestamp: persistedData.constellationData.lastLayoutTimestamp,
        nodeMetadata: persistedData.constellationData.nodeMetadata ?
          arrayToMap(persistedData.constellationData.nodeMetadata) : null,
        graphHashWhenPositionsComputed: graphHash
      }
    };
  } catch (error) {
    console.warn('Failed to deserialize constellation data:', error);
    return { constellationData: INITIAL_CONSTELLATION_LAYOUT };
  }
}
