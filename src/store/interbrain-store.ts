import { create } from 'zustand';
import { DreamNode } from '../types/dreamnode';
import { FibonacciSphereConfig, DEFAULT_FIBONACCI_CONFIG } from '../dreamspace/FibonacciSphereLayout';
import { MockDataConfig } from '../mock/dreamnode-mock-data';

// Creation state types
export interface ProtoNode {
  title: string;
  type: 'dream' | 'dreamer';
  dreamTalkFile?: globalThis.File;
  position: [number, number, number];
}

export interface ValidationErrors {
  title?: string;
  dreamTalk?: string;
}

export interface CreationState {
  isCreating: boolean;
  protoNode: ProtoNode | null;
  validationErrors: ValidationErrors;
}

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
  
  // Debug intersection point toggle
  debugIntersectionPoint: boolean;
  setDebugIntersectionPoint: (visible: boolean) => void;
  
  // Debug flying camera controls toggle
  debugFlyingControls: boolean;
  setDebugFlyingControls: (enabled: boolean) => void;
  
  // Mock data configuration
  mockDataConfig: MockDataConfig;
  setMockDataConfig: (config: MockDataConfig) => void;
  
  // Drag state management (prevents hover interference during sphere rotation)
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  
  // Creation state management
  creationState: CreationState;
  startCreation: (position: [number, number, number]) => void;
  updateProtoNode: (updates: Partial<ProtoNode>) => void;
  setValidationErrors: (errors: ValidationErrors) => void;
  completeCreation: () => void;
  cancelCreation: () => void;
}

export const useInterBrainStore = create<InterBrainState>((set) => ({
  // Initial state
  selectedNode: null,
  searchResults: [],
  spatialLayout: 'constellation',
  fibonacciConfig: DEFAULT_FIBONACCI_CONFIG,
  
  // Camera initial state
  camera: {
    position: [0, 0, 0], // Camera at origin for proper Dynamic View Scaling
    target: [0, 0, 0],   // Looking at origin
    isTransitioning: false,
    transitionDuration: 1000, // 1 second default
  },
  
  // Layout transition initial state
  layoutTransition: {
    isTransitioning: false,
    progress: 0,
    previousLayout: null,
  },
  
  // Debug wireframe sphere initial state (on by default for development)
  debugWireframeSphere: false,
  
  // Debug intersection point initial state (on by default for development)
  debugIntersectionPoint: false,
  
  // Debug flying camera controls initial state (off by default)
  debugFlyingControls: false,
  
  // Mock data configuration initial state (single node for testing)
  mockDataConfig: 'fibonacci-100',
  
  // Drag state initial state (not dragging)
  isDragging: false,
  
  // Creation state initial state (not creating)
  creationState: {
    isCreating: false,
    protoNode: null,
    validationErrors: {}
  },
  
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
  
  // Debug intersection point actions
  setDebugIntersectionPoint: (visible) => set({ debugIntersectionPoint: visible }),
  
  // Debug flying camera controls actions
  setDebugFlyingControls: (enabled) => set({ debugFlyingControls: enabled }),
  
  // Mock data configuration actions
  setMockDataConfig: (config) => set({ mockDataConfig: config }),
  
  // Drag state actions
  setIsDragging: (dragging) => set({ isDragging: dragging }),
  
  // Creation state actions
  startCreation: (position) => set((_state) => ({
    creationState: {
      isCreating: true,
      protoNode: {
        title: '',
        type: 'dream', // Default to dream type
        position,
        dreamTalkFile: undefined
      },
      validationErrors: {}
    }
  })),
  
  updateProtoNode: (updates) => set(state => ({
    creationState: {
      ...state.creationState,
      protoNode: state.creationState.protoNode 
        ? { ...state.creationState.protoNode, ...updates }
        : null
    }
  })),
  
  setValidationErrors: (errors) => set(state => ({
    creationState: {
      ...state.creationState,
      validationErrors: errors
    }
  })),
  
  completeCreation: () => set((_state) => ({
    creationState: {
      isCreating: false,
      protoNode: null,
      validationErrors: {}
    }
  })),
  
  cancelCreation: () => set((_state) => ({
    creationState: {
      isCreating: false,
      protoNode: null,
      validationErrors: {}
    }
  })),
}));