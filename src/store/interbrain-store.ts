import { create } from 'zustand';
import { DreamNode } from '../services/dreamnode-service';

export interface InterBrainState {
  // Selected DreamNode state
  selectedNode: DreamNode | null;
  setSelectedNode: (node: DreamNode | null) => void;
  
  // Search functionality state
  searchResults: DreamNode[];
  setSearchResults: (results: DreamNode[]) => void;
  
  // Spatial layout state
  spatialLayout: 'constellation' | 'search' | 'focused';
  setSpatialLayout: (layout: 'constellation' | 'search' | 'focused') => void;
}

export const useInterBrainStore = create<InterBrainState>((set) => ({
  // Initial state
  selectedNode: null,
  searchResults: [],
  spatialLayout: 'constellation',
  
  // Actions
  setSelectedNode: (node) => set({ selectedNode: node }),
  setSearchResults: (results) => set({ searchResults: results }),
  setSpatialLayout: (layout) => set({ spatialLayout: layout }),
}));