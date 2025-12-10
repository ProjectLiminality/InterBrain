import { StateCreator } from 'zustand';
import { DreamSongData } from './types/dreamsong';
import {
  DreamSongRelationshipGraph,
  SerializableDreamSongGraph,
  serializeRelationshipGraph,
  deserializeRelationshipGraph
} from './types/relationship';

// Re-export relationship types for consumers
export type { DreamSongRelationshipGraph, SerializableDreamSongGraph };
export { serializeRelationshipGraph, deserializeRelationshipGraph };

/**
 * DreamSong cache entry
 */
export interface DreamSongCacheEntry {
  data: DreamSongData;
  timestamp: number;
  structureHash: string;
}

/**
 * DreamSong relationship data state
 * Tracks the relationship graph derived from DreamSong canvas sequences
 */
export interface DreamSongRelationshipState {
  /** The relationship graph extracted from DreamSongs */
  graph: DreamSongRelationshipGraph | null;
  /** Timestamp of last successful scan */
  lastScanTimestamp: number | null;
  /** Whether a scan is currently in progress */
  isScanning: boolean;
}

/**
 * Initial DreamSong relationship state
 */
export const INITIAL_DREAMSONG_RELATIONSHIP_STATE: DreamSongRelationshipState = {
  graph: null,
  lastScanTimestamp: null,
  isScanning: false
};

/**
 * Dreamweaving slice - owns DreamSong-related state including relationships
 */
export interface DreamweavingSlice {
  // Selected DreamNode's DreamSong data
  selectedNodeDreamSongData: DreamSongData | null;
  setSelectedNodeDreamSongData: (data: DreamSongData | null) => void;

  // DreamSong cache for service layer
  dreamSongCache: Map<string, DreamSongCacheEntry>;
  getCachedDreamSong: (nodeId: string, structureHash: string) => DreamSongCacheEntry | null;
  setCachedDreamSong: (nodeId: string, structureHash: string, data: DreamSongData) => void;
  clearDreamSongCache: () => void;

  // DreamSong relationship graph (extracted from canvas sequences)
  dreamSongRelationships: DreamSongRelationshipState;
  setDreamSongRelationshipGraph: (graph: DreamSongRelationshipGraph | null) => void;
  setDreamSongRelationshipScanning: (scanning: boolean) => void;
  clearDreamSongRelationships: () => void;
}

/**
 * Helper function to get current scroll position of DreamSong content
 */
export function getDreamSongScrollPosition(nodeId: string): number | null {
  try {
    if (typeof document === 'undefined') return null;

    const dreamSongLeaf = document.querySelector(`[data-type="dreamsong-fullscreen"][data-node-id="${nodeId}"]`);
    if (dreamSongLeaf) {
      const scrollContainer = dreamSongLeaf.querySelector('.dreamsong-content');
      if (scrollContainer && 'scrollTop' in scrollContainer) {
        return (scrollContainer as HTMLElement).scrollTop;
      }
    }

    const dreamSpaceContent = document.querySelector(`.dreamsong-container[data-node-id="${nodeId}"] .dreamsong-content`);
    if (dreamSpaceContent && 'scrollTop' in dreamSpaceContent) {
      return (dreamSpaceContent as HTMLElement).scrollTop;
    }

    return null;
  } catch (error) {
    console.warn(`Failed to get scroll position for node ${nodeId}:`, error);
    return null;
  }
}

/**
 * Helper function to restore scroll position of DreamSong content
 */
export function restoreDreamSongScrollPosition(nodeId: string, scrollPosition: number): void {
  try {
    if (typeof document === 'undefined') return;

    const dreamSongLeaf = document.querySelector(`[data-type="dreamsong-fullscreen"][data-node-id="${nodeId}"]`);
    if (dreamSongLeaf) {
      const scrollContainer = dreamSongLeaf.querySelector('.dreamsong-content');
      if (scrollContainer && 'scrollTop' in scrollContainer) {
        (scrollContainer as HTMLElement).scrollTop = scrollPosition;
        return;
      }
    }

    const dreamSpaceContent = document.querySelector(`.dreamsong-container[data-node-id="${nodeId}"] .dreamsong-content`);
    if (dreamSpaceContent && 'scrollTop' in dreamSpaceContent) {
      (dreamSpaceContent as HTMLElement).scrollTop = scrollPosition;
    }
  } catch (error) {
    console.warn(`Failed to restore scroll position for node ${nodeId}:`, error);
  }
}

/**
 * Creates the dreamweaving slice
 */
export const createDreamweavingSlice: StateCreator<
  DreamweavingSlice,
  [],
  [],
  DreamweavingSlice
> = (set, get) => ({
  selectedNodeDreamSongData: null,
  dreamSongCache: new Map<string, DreamSongCacheEntry>(),

  setSelectedNodeDreamSongData: (data) => set({ selectedNodeDreamSongData: data }),

  getCachedDreamSong: (nodeId: string, structureHash: string) => {
    const cacheKey = `${nodeId}-${structureHash}`;
    return get().dreamSongCache.get(cacheKey) || null;
  },

  setCachedDreamSong: (nodeId: string, structureHash: string, data: DreamSongData) => {
    const cacheKey = `${nodeId}-${structureHash}`;
    const entry: DreamSongCacheEntry = {
      data,
      timestamp: Date.now(),
      structureHash
    };
    set((state) => {
      const newCache = new Map(state.dreamSongCache);
      newCache.set(cacheKey, entry);
      return { dreamSongCache: newCache };
    });
  },

  clearDreamSongCache: () => set({ dreamSongCache: new Map() }),

  // DreamSong relationship graph state
  dreamSongRelationships: INITIAL_DREAMSONG_RELATIONSHIP_STATE,

  setDreamSongRelationshipGraph: (graph) => set((state) => ({
    dreamSongRelationships: {
      ...state.dreamSongRelationships,
      graph,
      lastScanTimestamp: graph ? Date.now() : null,
      isScanning: false
    }
  })),

  setDreamSongRelationshipScanning: (scanning) => set((state) => ({
    dreamSongRelationships: {
      ...state.dreamSongRelationships,
      isScanning: scanning
    }
  })),

  clearDreamSongRelationships: () => set({
    dreamSongRelationships: INITIAL_DREAMSONG_RELATIONSHIP_STATE
  }),
});

/**
 * Extracts persistence data for dreamweaving slice (DreamSong relationships)
 */
export function extractDreamweavingPersistenceData(state: DreamweavingSlice) {
  return {
    dreamSongRelationships: state.dreamSongRelationships.graph ? {
      graph: serializeRelationshipGraph(state.dreamSongRelationships.graph),
      lastScanTimestamp: state.dreamSongRelationships.lastScanTimestamp,
      isScanning: false
    } : null
  };
}

/**
 * Restores persistence data for dreamweaving slice
 */
export function restoreDreamweavingPersistenceData(persistedData: {
  dreamSongRelationships?: {
    graph: SerializableDreamSongGraph | null;
    lastScanTimestamp: number | null;
    isScanning: boolean;
  } | null;
}): Partial<DreamweavingSlice> {
  if (!persistedData.dreamSongRelationships?.graph) {
    return { dreamSongRelationships: INITIAL_DREAMSONG_RELATIONSHIP_STATE };
  }

  try {
    return {
      dreamSongRelationships: {
        graph: deserializeRelationshipGraph(persistedData.dreamSongRelationships.graph),
        lastScanTimestamp: persistedData.dreamSongRelationships.lastScanTimestamp,
        isScanning: false
      }
    };
  } catch (error) {
    console.warn('Failed to deserialize DreamSong relationship data:', error);
    return { dreamSongRelationships: INITIAL_DREAMSONG_RELATIONSHIP_STATE };
  }
}
