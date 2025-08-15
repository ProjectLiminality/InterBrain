import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DreamNode } from '../types/dreamnode';
import { FibonacciSphereConfig, DEFAULT_FIBONACCI_CONFIG } from '../dreamspace/FibonacciSphereLayout';
import { MockDataConfig } from '../mock/dreamnode-mock-data';
import { VectorData } from '../services/indexing-service';
import { EmbeddingConfig } from '../services/embedding-service';
import { DEFAULT_EMBEDDING_CONFIG } from '../services/ollama-embedding-service';

// Navigation history types
export interface NavigationHistoryEntry {
  /** Node ID that was focused (null for constellation view) */
  nodeId: string | null;
  /** Layout type at the time */
  layout: 'constellation' | 'liminal-web';
  /** Timestamp of the navigation action */
  timestamp: number;
}

export interface NavigationHistoryState {
  /** Stack of past navigation states */
  history: NavigationHistoryEntry[];
  /** Current position in history (0 = most recent) */
  currentIndex: number;
  /** Maximum history entries to keep */
  maxHistorySize: number;
}

// Creation state types
export interface ProtoNode {
  title: string;
  type: 'dream' | 'dreamer';
  dreamTalkFile?: globalThis.File;
  additionalFiles?: globalThis.File[];
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

// Real node storage - persisted across sessions
export interface RealNodeData {
  node: DreamNode;
  fileHash?: string; // For detecting file changes
  lastSynced: number; // Timestamp of last vault sync
}

// Ollama configuration for embedding service
export interface OllamaConfig {
  baseUrl: string;
  model: string;
  enabled: boolean;
  embedding: EmbeddingConfig;
}

// Default Ollama configuration
export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'nomic-embed-text',
  enabled: true,
  embedding: DEFAULT_EMBEDDING_CONFIG
};

export interface InterBrainState {
  // Data mode toggle
  dataMode: 'mock' | 'real';
  setDataMode: (mode: 'mock' | 'real') => void;
  
  // Real nodes storage (persisted)
  realNodes: Map<string, RealNodeData>;
  setRealNodes: (nodes: Map<string, RealNodeData>) => void;
  updateRealNode: (id: string, data: RealNodeData) => void;
  deleteRealNode: (id: string) => void;
  
  // Vector data storage for semantic search (persisted)
  vectorData: Map<string, VectorData>;
  updateVectorData: (nodeId: string, data: VectorData) => void;
  deleteVectorData: (nodeId: string) => void;
  clearVectorData: () => void;
  
  // Ollama embedding configuration (persisted)
  ollamaConfig: OllamaConfig;
  setOllamaConfig: (config: Partial<OllamaConfig>) => void;
  resetOllamaConfig: () => void;
  
  // Selected DreamNode state
  selectedNode: DreamNode | null;
  setSelectedNode: (node: DreamNode | null) => void;
  
  // Creator mode state
  creatorMode: {
    isActive: boolean;
    nodeId: string | null; // ID of the node being edited
  };
  setCreatorMode: (active: boolean, nodeId?: string | null) => void;
  
  // Search functionality state
  searchResults: DreamNode[];
  setSearchResults: (results: DreamNode[]) => void;
  
  // Spatial layout state
  spatialLayout: 'constellation' | 'search' | 'liminal-web';
  setSpatialLayout: (layout: 'constellation' | 'search' | 'liminal-web') => void;
  
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
    previousLayout: 'constellation' | 'search' | 'liminal-web' | null;
  };
  setLayoutTransition: (isTransitioning: boolean, progress?: number, previousLayout?: 'constellation' | 'search' | 'liminal-web' | null) => void;
  
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
  
  // Persistent mock relationship data
  mockRelationshipData: Map<string, string[]> | null;
  generateMockRelationships: () => void;
  clearMockRelationships: () => void;
  
  // Drag state management (prevents hover interference during sphere rotation)
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  
  // Creation state management
  creationState: CreationState;
  startCreation: (position: [number, number, number]) => void;
  startCreationWithData: (position: [number, number, number], initialData?: Partial<ProtoNode>) => void;
  updateProtoNode: (updates: Partial<ProtoNode>) => void;
  setValidationErrors: (errors: ValidationErrors) => void;
  completeCreation: () => void;
  cancelCreation: () => void;
  
  // Navigation history management
  navigationHistory: NavigationHistoryState;
  isRestoringFromHistory: boolean;
  setRestoringFromHistory: (restoring: boolean) => void;
  addHistoryEntry: (nodeId: string | null, layout: 'constellation' | 'liminal-web') => void;
  getHistoryEntryForUndo: () => NavigationHistoryEntry | null;
  getHistoryEntryForRedo: () => NavigationHistoryEntry | null;
  performUndo: () => boolean;
  performRedo: () => boolean;
  clearNavigationHistory: () => void;
}

// Helper to convert Map to serializable format for persistence
const mapToArray = <K, V>(map: Map<K, V>): [K, V][] => Array.from(map.entries());
const arrayToMap = <K, V>(array: [K, V][]): Map<K, V> => new Map(array);

export const useInterBrainStore = create<InterBrainState>()(
  persist(
    (set) => ({
  // Initial state
  dataMode: 'mock' as const, // Start in mock mode
  realNodes: new Map<string, RealNodeData>(),
  vectorData: new Map<string, VectorData>(),
  ollamaConfig: DEFAULT_OLLAMA_CONFIG,
  selectedNode: null,
  creatorMode: {
    isActive: false,
    nodeId: null
  },
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
  
  // Persistent mock relationship data initial state
  mockRelationshipData: null,
  
  // Drag state initial state (not dragging)
  isDragging: false,
  
  // Creation state initial state (not creating)
  creationState: {
    isCreating: false,
    protoNode: null,
    validationErrors: {}
  },
  
  // Navigation history initial state (with initial constellation state)
  navigationHistory: {
    history: [{
      nodeId: null,
      layout: 'constellation',
      timestamp: Date.now()
    }],
    currentIndex: 0, // Start at the initial constellation state
    maxHistorySize: 150 // High limit for ultra-lightweight entries
  },
  
  // Flag to disable history tracking during undo/redo operations
  isRestoringFromHistory: false,
  
  // Actions
  setDataMode: (mode) => set({ dataMode: mode }),
  setRealNodes: (nodes) => set({ realNodes: nodes }),
  updateRealNode: (id, data) => set(state => {
    const newMap = new Map(state.realNodes);
    newMap.set(id, data);
    return { realNodes: newMap };
  }),
  deleteRealNode: (id) => set(state => {
    const newMap = new Map(state.realNodes);
    newMap.delete(id);
    return { realNodes: newMap };
  }),
  
  // Vector data actions
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
  
  // Ollama configuration actions
  setOllamaConfig: (config) => set(state => ({
    ollamaConfig: { ...state.ollamaConfig, ...config }
  })),
  resetOllamaConfig: () => set({ ollamaConfig: DEFAULT_OLLAMA_CONFIG }),
  
  setSelectedNode: (node) => set(state => {
    const previousNode = state.selectedNode;
    const currentLayout = state.spatialLayout;
    
    // Detect meaningful node selection changes for history tracking
    const isMeaningfulChange = (
      // Within Liminal Web: different node selected
      currentLayout === 'liminal-web' && 
      previousNode && 
      node && 
      previousNode.id !== node.id
    );
    
    // Record history entry for meaningful changes (but not during undo/redo operations)
    if (isMeaningfulChange && !state.isRestoringFromHistory) {
      // Create new entry
      const newEntry: NavigationHistoryEntry = {
        nodeId: node.id,
        layout: 'liminal-web',
        timestamp: Date.now()
      };
      
      // Add to history (reuse existing addHistoryEntry logic)
      const { history, currentIndex, maxHistorySize } = state.navigationHistory;
      
      // Check if this entry is a duplicate of the current entry (prevent undo/redo loops)
      const currentEntry = history[currentIndex];
      const isDuplicate = currentEntry && 
        currentEntry.nodeId === newEntry.nodeId && 
        currentEntry.layout === newEntry.layout;
      
      if (isDuplicate) {
        // Don't add duplicate entry - just update selected node
        return { selectedNode: node };
      }
      
      // If we're not at the end of history, clear everything after current position
      const newHistory = currentIndex >= 0 
        ? [...history.slice(0, currentIndex + 1), newEntry]
        : [newEntry];
      
      // Ensure history doesn't exceed max size
      const trimmedHistory = newHistory.length > maxHistorySize
        ? newHistory.slice(-maxHistorySize)
        : newHistory;
      
      return {
        selectedNode: node,
        navigationHistory: {
          ...state.navigationHistory,
          history: trimmedHistory,
          currentIndex: trimmedHistory.length - 1
        }
      };
    }
    
    // Non-meaningful change - just update selected node
    return { selectedNode: node };
  }),
  setCreatorMode: (active, nodeId = null) => set({ 
    creatorMode: { isActive: active, nodeId: nodeId } 
  }),
  setSearchResults: (results) => set({ searchResults: results }),
  setSpatialLayout: (layout) => set(state => {
    const previousLayout = state.spatialLayout;
    const selectedNode = state.selectedNode;
    
    // Detect meaningful layout changes for history tracking
    const isMeaningfulChange = (
      // Constellation → Liminal Web (with selected node)
      (previousLayout === 'constellation' && layout === 'liminal-web' && selectedNode) ||
      // Liminal Web → Constellation  
      (previousLayout === 'liminal-web' && layout === 'constellation')
      // Note: Within Liminal Web changes are handled by setSelectedNode
    );
    
    // Record history entry for meaningful changes (but not during undo/redo operations)
    if (isMeaningfulChange && !state.isRestoringFromHistory) {
      // Create new entry (inside this block, layout can only be 'constellation' or 'liminal-web')
      const newEntry: NavigationHistoryEntry = {
        nodeId: layout === 'liminal-web' ? selectedNode?.id || null : null,
        layout: layout, // Already narrowed to valid types by isMeaningfulChange condition
        timestamp: Date.now()
      };
      
      // Add to history (reuse existing addHistoryEntry logic)
      const { history, currentIndex, maxHistorySize } = state.navigationHistory;
      
      // Check if this entry is a duplicate of the current entry (prevent undo/redo loops)
      const currentEntry = history[currentIndex];
      const isDuplicate = currentEntry && 
        currentEntry.nodeId === newEntry.nodeId && 
        currentEntry.layout === newEntry.layout;
      
      if (isDuplicate) {
        // Don't add duplicate entry - just update layout without history changes
        return {
          spatialLayout: layout,
          layoutTransition: {
            ...state.layoutTransition,
            previousLayout: state.spatialLayout,
          }
        };
      }
      
      // If we're not at the end of history, clear everything after current position
      const newHistory = currentIndex >= 0 
        ? [...history.slice(0, currentIndex + 1), newEntry]
        : [newEntry];
      
      // Ensure history doesn't exceed max size
      const trimmedHistory = newHistory.length > maxHistorySize
        ? newHistory.slice(-maxHistorySize)
        : newHistory;
      
      return {
        spatialLayout: layout,
        layoutTransition: {
          ...state.layoutTransition,
          previousLayout: state.spatialLayout,
        },
        navigationHistory: {
          ...state.navigationHistory,
          history: trimmedHistory,
          currentIndex: trimmedHistory.length - 1
        }
      };
    }
    
    // Non-meaningful change - just update layout
    return {
      spatialLayout: layout,
      layoutTransition: {
        ...state.layoutTransition,
        previousLayout: state.spatialLayout,
      }
    };
  }),
  
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
  
  // Mock relationship data actions
  generateMockRelationships: () => set(state => {
    const { mockDataConfig } = state;
    const nodeCount = mockDataConfig === 'single-node' ? 1 : 
                     mockDataConfig === 'fibonacci-12' ? 12 :
                     mockDataConfig === 'fibonacci-50' ? 50 : 100;
    
    const relationships = new Map<string, string[]>();
    
    // First pass: Initialize all nodes in the map
    for (let i = 0; i < nodeCount; i++) {
      const nodeType = i % 3 !== 0 ? 'dream' : 'dreamer';
      const nodeId = `mock-${nodeType}-${i}`;
      relationships.set(nodeId, []);
    }
    
    // Second pass: Generate bidirectional relationships between Dreams and Dreamers
    for (let i = 0; i < nodeCount; i++) {
      const sourceType = i % 3 !== 0 ? 'dream' : 'dreamer';
      const sourceId = `mock-${sourceType}-${i}`;
      
      // Use deterministic pattern for consistent relationships
      const stepSizes = [1, 3, 7, 11, 13];
      const maxConnections = Math.min(5, Math.floor(nodeCount / 4));
      
      for (let j = 0; j < Math.min(stepSizes.length, maxConnections); j++) {
        const step = stepSizes[j];
        const targetIndex = (i + step) % nodeCount;
        const targetType = targetIndex % 3 !== 0 ? 'dream' : 'dreamer';
        
        // Only connect Dreams to Dreamers and vice versa
        if (sourceType !== targetType) {
          const targetId = `mock-${targetType}-${targetIndex}`;
          
          // Add forward connection if not already present
          const sourceConnections = relationships.get(sourceId)!;
          if (!sourceConnections.includes(targetId)) {
            sourceConnections.push(targetId);
          }
          
          // Add reverse connection if not already present
          const targetConnections = relationships.get(targetId)!;
          if (!targetConnections.includes(sourceId)) {
            targetConnections.push(sourceId);
          }
        }
      }
      
      // Ensure at least one connection if possible
      const sourceConnections = relationships.get(sourceId)!;
      if (sourceConnections.length === 0 && nodeCount > 1) {
        for (let offset = 1; offset < nodeCount; offset++) {
          const targetIndex = (i + offset) % nodeCount;
          const targetType = targetIndex % 3 !== 0 ? 'dream' : 'dreamer';
          
          if (sourceType !== targetType) {
            const targetId = `mock-${targetType}-${targetIndex}`;
            
            // Add forward connection
            sourceConnections.push(targetId);
            
            // Add reverse connection
            const targetConnections = relationships.get(targetId)!;
            if (!targetConnections.includes(sourceId)) {
              targetConnections.push(sourceId);
            }
            break;
          }
        }
      }
    }
    
    // Verify bidirectionality (basic check)
    relationships.forEach((connections, sourceId) => {
      connections.forEach(targetId => {
        const targetConnections = relationships.get(targetId);
        if (!targetConnections || !targetConnections.includes(sourceId)) {
          // Skip tracking errors for now - just ensure basic structure
        }
      });
    });
    
    return { mockRelationshipData: relationships };
  }),
  
  clearMockRelationships: () => set({ mockRelationshipData: null }),
  
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
  
  startCreationWithData: (position, initialData) => set((_state) => ({
    creationState: {
      isCreating: true,
      protoNode: {
        title: initialData?.title || '',
        type: initialData?.type || 'dream',
        position,
        dreamTalkFile: initialData?.dreamTalkFile || undefined,
        additionalFiles: initialData?.additionalFiles || undefined
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
  
  // Navigation history actions
  addHistoryEntry: (nodeId, layout) => set(state => {
    const { history, currentIndex, maxHistorySize } = state.navigationHistory;
    
    // Create new entry
    const newEntry: NavigationHistoryEntry = {
      nodeId,
      layout,
      timestamp: Date.now()
    };
    
    // If we're not at the end of history (user has undone some actions),
    // clear everything after current position (standard undo/redo behavior)
    const newHistory = currentIndex >= 0 
      ? [...history.slice(0, currentIndex + 1), newEntry]
      : [newEntry];
    
    // Ensure history doesn't exceed max size (remove oldest entries)
    const trimmedHistory = newHistory.length > maxHistorySize
      ? newHistory.slice(-maxHistorySize)
      : newHistory;
    
    return {
      navigationHistory: {
        ...state.navigationHistory,
        history: trimmedHistory,
        currentIndex: trimmedHistory.length - 1
      }
    };
  }),
  
  getHistoryEntryForUndo: () => {
    // This function will be called from commands which have access to getState()
    return null; // Commands will implement the logic
  },
  
  getHistoryEntryForRedo: () => {
    // This function will be called from commands which have access to getState()
    return null; // Commands will implement the logic
  },
  
  performUndo: () => {
    let success = false;
    
    set(state => {
      const { currentIndex } = state.navigationHistory;
      
      if (currentIndex <= 0) {
        return state; // Nothing to undo
      }
      
      success = true;
      
      // Move to previous entry
      return {
        navigationHistory: {
          ...state.navigationHistory,
          currentIndex: currentIndex - 1
        }
      };
    });
    
    return success;
  },
  
  performRedo: () => {
    let success = false;
    
    set(state => {
      const { currentIndex, history } = state.navigationHistory;
      
      if (currentIndex >= history.length - 1) {
        return state; // Nothing to redo
      }
      
      success = true;
      
      // Move to next entry
      return {
        navigationHistory: {
          ...state.navigationHistory,
          currentIndex: currentIndex + 1
        }
      };
    });
    
    return success;
  },
  
  clearNavigationHistory: () => set(state => ({
    navigationHistory: {
      ...state.navigationHistory,
      history: [],
      currentIndex: -1
    }
  })),
  
  setRestoringFromHistory: (restoring) => set({ isRestoringFromHistory: restoring }),
    }),
    {
      name: 'interbrain-storage', // Storage key
      // Only persist real nodes data, data mode, vector data, mock relationships, and Ollama config
      partialize: (state) => ({
        dataMode: state.dataMode,
        realNodes: mapToArray(state.realNodes),
        vectorData: mapToArray(state.vectorData),
        mockRelationshipData: state.mockRelationshipData ? mapToArray(state.mockRelationshipData) : null,
        ollamaConfig: state.ollamaConfig,
      }),
      // Custom merge function to handle Map deserialization
      merge: (persisted: unknown, current) => {
        const persistedData = persisted as { 
          dataMode: 'mock' | 'real'; 
          realNodes: [string, RealNodeData][];
          vectorData: [string, VectorData][];
          mockRelationshipData: [string, string[]][] | null;
          ollamaConfig: OllamaConfig;
        };
        return {
          ...current,
          dataMode: persistedData.dataMode || 'mock',
          realNodes: persistedData.realNodes ? arrayToMap(persistedData.realNodes) : new Map(),
          vectorData: persistedData.vectorData ? arrayToMap(persistedData.vectorData) : new Map(),
          mockRelationshipData: persistedData.mockRelationshipData ? arrayToMap(persistedData.mockRelationshipData) : null,
          ollamaConfig: persistedData.ollamaConfig || DEFAULT_OLLAMA_CONFIG,
        };
      },
    }
  )
);