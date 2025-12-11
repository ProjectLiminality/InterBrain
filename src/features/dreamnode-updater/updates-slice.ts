import { StateCreator } from 'zustand';
import type { FetchResult } from '../social-resonance-filter/services/git-sync-service';

// Re-export type for convenience
export type { FetchResult };

/**
 * Updates slice - owns update status for DreamNodes
 */
export interface UpdatesSlice {
  // Update status for DreamNodes (non-persisted)
  updateStatus: Map<string, FetchResult>;
  setNodeUpdateStatus: (nodeId: string, result: FetchResult) => void;
  clearNodeUpdateStatus: (nodeId: string) => void;
  getNodeUpdateStatus: (nodeId: string) => FetchResult | null;
}

/**
 * Creates the updates slice
 */
export const createUpdatesSlice: StateCreator<
  UpdatesSlice,
  [],
  [],
  UpdatesSlice
> = (set, get) => ({
  // Update status state (non-persisted)
  updateStatus: new Map(),

  setNodeUpdateStatus: (nodeId, result) => set((state) => {
    const newStatus = new Map(state.updateStatus);
    newStatus.set(nodeId, result);
    return { updateStatus: newStatus };
  }),

  clearNodeUpdateStatus: (nodeId) => set((state) => {
    const newStatus = new Map(state.updateStatus);
    newStatus.delete(nodeId);
    return { updateStatus: newStatus };
  }),

  getNodeUpdateStatus: (nodeId) => {
    return get().updateStatus.get(nodeId) || null;
  },
});
