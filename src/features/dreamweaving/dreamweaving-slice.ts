import { StateCreator } from 'zustand';
import { DreamSongData } from './types/dreamsong';

/**
 * DreamSong cache entry
 */
export interface DreamSongCacheEntry {
  data: DreamSongData;
  timestamp: number;
  structureHash: string;
}

/**
 * Dreamweaving slice - owns DreamSong-related state
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
});
