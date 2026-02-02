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
    // Debug: ALWAYS log when this function is called
    console.log(`[ConstellationSlice] setConstellationPositions called:`, {
      hasPositions: !!positions,
      size: positions?.size ?? 0,
      isMap: positions instanceof Map
    });

    // Debug: verify positions have actual values before storing
    if (positions && positions.size > 0) {
      const firstEntry = Array.from(positions.entries())[0];
      console.log(`[ConstellationSlice] First entry:`, JSON.stringify(firstEntry));
      if (!firstEntry[1] || !Array.isArray(firstEntry[1])) {
        console.error(`[ConstellationSlice] CORRUPTED INPUT: Position value is not an array:`, firstEntry[1]);
      }
    }

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
  const positionsCount = state.constellationData.positions?.size ?? 0;
  const graphHash = state.constellationData.graphHashWhenPositionsComputed;
  console.log(`[ConstellationSlice] Extracting ${positionsCount} positions for persistence (graphHash=${graphHash})`);

  // Debug: log first 3 positions to verify they have actual values
  if (state.constellationData.positions && state.constellationData.positions.size > 0) {
    const entries = Array.from(state.constellationData.positions.entries()).slice(0, 3);
    console.log(`[ConstellationSlice] First 3 positions being extracted: ${JSON.stringify(entries)}`);
    // Check if any values are undefined
    const hasUndefined = entries.some(([k, v]) => v === undefined || v === null);
    if (hasUndefined) {
      console.error(`[ConstellationSlice] EXTRACTION BUG: Positions have undefined values!`);
    }
  }

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
    console.log('[ConstellationSlice] No constellationData in persisted state');
    return { constellationData: INITIAL_CONSTELLATION_LAYOUT };
  }

  try {
    const positionsArray = persistedData.constellationData.positions;
    const positionsCount = positionsArray?.length ?? 0;
    const graphHash = persistedData.constellationData.graphHashWhenPositionsComputed ?? null;
    console.log(`[ConstellationSlice] Restoring ${positionsCount} positions from persisted state (graphHash=${graphHash})`);

    // Debug: log first 3 entries to verify data structure
    if (positionsArray && positionsArray.length > 0) {
      console.log(`[ConstellationSlice] First 3 position entries:`, positionsArray.slice(0, 3));
    }

    let positionsMap = positionsArray ? arrayToMap(positionsArray) : null;

    // CRITICAL: Validate that position values are actual coordinate arrays with real numbers
    // Corrupted data can be: null, undefined, or [null, null, null]
    if (positionsMap) {
      const firstKey = Array.from(positionsMap.keys())[0];
      const firstValue = positionsMap.get(firstKey);
      console.log(`[ConstellationSlice] Map created: size=${positionsMap.size}, firstKey=${firstKey}, firstValue=${JSON.stringify(firstValue)}`);

      // Check if values are corrupted (null, undefined, or arrays with null elements)
      const isCorrupted = !firstValue ||
        !Array.isArray(firstValue) ||
        firstValue.length !== 3 ||
        firstValue.some(v => v === null || v === undefined || !Number.isFinite(v));

      if (isCorrupted) {
        console.warn(`[ConstellationSlice] CORRUPTED: Position values are invalid (${JSON.stringify(firstValue)}), clearing positions for recomputation`);
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
