import { create } from 'zustand';
import { DreamNode } from '../services/dreamnode-service';
import { FibonacciSphereConfig, DEFAULT_FIBONACCI_CONFIG } from '../dreamspace/FibonacciSphereLayout';

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
  
  // Fibonacci sphere layout configuration
  fibonacciConfig: FibonacciSphereConfig;
  setFibonacciConfig: (config: Partial<FibonacciSphereConfig>) => void;
  resetFibonacciConfig: () => void;
  
  // Camera state management
  camera: {
    position: [number, number, number];
    target: [number, number, number];
    isTransitioning: boolean;
    transitionDuration: number;
  };
  setCameraPosition: (position: [number, number, number]) => void;
  setCameraTarget: (target: [number, number, number]) => void;
  setCameraTransition: (isTransitioning: boolean, duration?: number) => void;
  
  // Layout transition state
  layoutTransition: {
    isTransitioning: boolean;
    progress: number;
    previousLayout: 'constellation' | 'search' | 'focused' | null;
  };
  setLayoutTransition: (isTransitioning: boolean, progress?: number, previousLayout?: 'constellation' | 'search' | 'focused' | null) => void;
  
  // Debug wireframe sphere toggle
  debugWireframeSphere: boolean;
  setDebugWireframeSphere: (visible: boolean) => void;
}

export const useInterBrainStore = create<InterBrainState>((set) => ({
  // Initial state
  selectedNode: null,
  searchResults: [],
  spatialLayout: 'constellation',
  fibonacciConfig: DEFAULT_FIBONACCI_CONFIG,
  
  // Camera initial state
  camera: {
    position: [0, 0, 1000], // Default camera position from prototype
    target: [0, 0, 0],      // Looking at origin
    isTransitioning: false,
    transitionDuration: 1000, // 1 second default
  },
  
  // Layout transition initial state
  layoutTransition: {
    isTransitioning: false,
    progress: 0,
    previousLayout: null,
  },
  
  // Debug wireframe sphere initial state (off by default)
  debugWireframeSphere: false,
  
  // Actions
  setSelectedNode: (node) => set({ selectedNode: node }),
  setSearchResults: (results) => set({ searchResults: results }),
  setSpatialLayout: (layout) => set(state => ({ 
    spatialLayout: layout,
    layoutTransition: {
      ...state.layoutTransition,
      previousLayout: state.spatialLayout,
    }
  })),
  
  // Fibonacci sphere configuration actions
  setFibonacciConfig: (config) => set(state => ({
    fibonacciConfig: { ...state.fibonacciConfig, ...config }
  })),
  resetFibonacciConfig: () => set({ fibonacciConfig: DEFAULT_FIBONACCI_CONFIG }),
  
  // Camera actions
  setCameraPosition: (position) => set(state => ({ 
    camera: { ...state.camera, position } 
  })),
  setCameraTarget: (target) => set(state => ({ 
    camera: { ...state.camera, target } 
  })),
  setCameraTransition: (isTransitioning, duration = 1000) => set(state => ({ 
    camera: { ...state.camera, isTransitioning, transitionDuration: duration } 
  })),
  
  // Layout transition actions
  setLayoutTransition: (isTransitioning, progress = 0, previousLayout = null) => set(state => ({ 
    layoutTransition: { 
      isTransitioning, 
      progress, 
      previousLayout: previousLayout || state.layoutTransition.previousLayout 
    } 
  })),
  
  // Debug wireframe sphere actions
  setDebugWireframeSphere: (visible) => set({ debugWireframeSphere: visible }),
}));