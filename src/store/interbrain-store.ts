import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DreamNode } from '../types/dreamnode';
import { DreamSongData } from '../types/dreamsong';
import { FibonacciSphereConfig, DEFAULT_FIBONACCI_CONFIG } from '../dreamspace/FibonacciSphereLayout';
import { MockDataConfig } from '../mock/dreamnode-mock-data';
import {
  OllamaConfigSlice,
  createOllamaConfigSlice,
  extractOllamaPersistenceData,
  restoreOllamaPersistenceData,
  OllamaConfig
} from '../features/semantic-search/store/ollama-config-slice';
// OllamaConfig imports are in the semantic search slice
import { VectorData } from '../features/semantic-search/services/indexing-service';
import { FlipState } from '../types/dreamsong';
import {
  DreamSongRelationshipGraph,
  SerializableDreamSongGraph,
  serializeRelationshipGraph,
  deserializeRelationshipGraph
} from '../types/constellation';

// Helper function to get current scroll position of DreamSong content
function getDreamSongScrollPosition(nodeId: string): number | null {
  try {
    // Ensure we're in browser environment
    if (typeof document === 'undefined') return null;
    
    // Look for DreamSong leaf in right pane containing this nodeId
     
    const dreamSongLeaf = document.querySelector(`[data-type="dreamsong-fullscreen"][data-node-id="${nodeId}"]`);
    if (dreamSongLeaf) {
      const scrollContainer = dreamSongLeaf.querySelector('.dreamsong-content');
      if (scrollContainer && 'scrollTop' in scrollContainer) {
         
        return (scrollContainer as HTMLElement).scrollTop;
      }
    }
    
    // Also check for embedded DreamSong content in DreamSpace
     
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

// Helper function to restore scroll position of DreamSong content
function restoreDreamSongScrollPosition(nodeId: string, scrollPosition: number): void {
  try {
    // Ensure we're in browser environment
    if (typeof document === 'undefined') return;
    
    // Look for DreamSong leaf in right pane containing this nodeId
     
    const dreamSongLeaf = document.querySelector(`[data-type="dreamsong-fullscreen"][data-node-id="${nodeId}"]`);
    if (dreamSongLeaf) {
      const scrollContainer = dreamSongLeaf.querySelector('.dreamsong-content');
      if (scrollContainer && 'scrollTop' in scrollContainer) {
         
        (scrollContainer as HTMLElement).scrollTop = scrollPosition;
        return;
      }
    }
    
    // Also check for embedded DreamSong content in DreamSpace
     
    const dreamSpaceContent = document.querySelector(`.dreamsong-container[data-node-id="${nodeId}"] .dreamsong-content`);
    if (dreamSpaceContent && 'scrollTop' in dreamSpaceContent) {
       
      (dreamSpaceContent as HTMLElement).scrollTop = scrollPosition;
    }
  } catch (error) {
    console.warn(`Failed to restore scroll position for node ${nodeId}:`, error);
  }
}

// Navigation history types
export interface NavigationHistoryEntry {
  /** Node ID that was focused (null for constellation view) */
  nodeId: string | null;
  /** Layout type at the time */
  layout: 'constellation' | 'liminal-web';
  /** Timestamp of the navigation action */
  timestamp: number;
  /** Flip state of the focused node (null if not flipped or no focused node) */
  flipState: FlipState | null;
  /** Scroll position in DreamSong content (null if not applicable) */
  scrollPosition: number | null;
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
  urlMetadata?: import('../utils/url-utils').UrlMetadata;
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

// Edit mode state types
export interface EditModeState {
  isActive: boolean;
  editingNode: DreamNode | null;
  originalRelationships: string[]; // Store original relationships for cancel operation
  pendingRelationships: string[]; // Track relationship changes
  searchResults: DreamNode[]; // Search results for relationship discovery
  validationErrors: EditModeValidationErrors; // Validation errors for edit mode
  newDreamTalkFile?: globalThis.File; // New media file for DreamTalk editing
  isSearchingRelationships: boolean; // Toggle state for relationship search interface
}

export interface EditModeValidationErrors {
  title?: string;
  dreamTalk?: string;
  relationships?: string;
}

// Copilot mode state types
export interface CopilotModeState {
  isActive: boolean;
  conversationPartner: DreamNode | null; // The person node at center
  transcriptionFilePath: string | null; // Path to active transcription file
  showSearchResults: boolean; // Option key held state for showing/hiding results
  frozenSearchResults: DreamNode[]; // Snapshot of results when showing
  sharedNodeIds: string[]; // Track invoked nodes for post-call processing
}

// Real node storage - persisted across sessions
export interface RealNodeData {
  node: DreamNode;
  fileHash?: string; // For detecting file changes
  lastSynced: number; // Timestamp of last vault sync
}

// DreamSong cache interface for service layer
export interface DreamSongCacheEntry {
  data: DreamSongData;
  timestamp: number;
  structureHash: string;
}

// Note: OllamaConfig and DEFAULT_OLLAMA_CONFIG moved to semantic search feature

export interface InterBrainState extends OllamaConfigSlice {
  // Data mode toggle
  dataMode: 'mock' | 'real';
  setDataMode: (mode: 'mock' | 'real') => void;
  
  // Real nodes storage (persisted)
  realNodes: Map<string, RealNodeData>;
  setRealNodes: (nodes: Map<string, RealNodeData>) => void;
  updateRealNode: (id: string, data: RealNodeData) => void;
  batchUpdateNodePositions: (positions: Map<string, [number, number, number]>) => void;
  deleteRealNode: (id: string) => void;
  
  // Selected DreamNode state
  selectedNode: DreamNode | null;
  setSelectedNode: (node: DreamNode | null) => void;
  
  // Selected DreamNode's DreamSong data (for reuse in full-screen)
  selectedNodeDreamSongData: DreamSongData | null;
  setSelectedNodeDreamSongData: (data: DreamSongData | null) => void;
  
  // DreamSong cache for service layer
  dreamSongCache: Map<string, DreamSongCacheEntry>;
  getCachedDreamSong: (nodeId: string, structureHash: string) => DreamSongCacheEntry | null;
  setCachedDreamSong: (nodeId: string, structureHash: string, data: DreamSongData) => void;
  
  // Creator mode state
  creatorMode: {
    isActive: boolean;
    nodeId: string | null; // ID of the node being edited
  };
  setCreatorMode: (active: boolean, nodeId?: string | null) => void;
  
  // Search functionality state
  searchResults: DreamNode[];
  setSearchResults: (results: DreamNode[]) => void;
  
  // Search interface state
  searchInterface: {
    isActive: boolean;
    isSaving: boolean; // Track if save animation is in progress
    currentQuery: string;
    lastQuery: string; // For change detection
  };
  setSearchActive: (active: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchSaving: (saving: boolean) => void;
  
  // Spatial layout state - expanded to include edit modes as first-class states
  spatialLayout: 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'edit-search' | 'copilot';
  setSpatialLayout: (layout: 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'edit-search' | 'copilot') => void;
  
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
    previousLayout: 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'edit-search' | 'copilot' | null;
  };
  setLayoutTransition: (isTransitioning: boolean, progress?: number, previousLayout?: 'constellation' | 'creation' | 'search' | 'liminal-web' | 'edit' | 'edit-search' | 'copilot' | null) => void;
  
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

  // Edit mode state management
  editMode: EditModeState;
  startEditMode: (node: DreamNode) => void;
  exitEditMode: () => void;
  updateEditingNodeMetadata: (updates: Partial<DreamNode>) => void;
  setEditModeNewDreamTalkFile: (file: globalThis.File | undefined) => void;
  setEditModeSearchResults: (results: DreamNode[]) => void;
  setEditModeSearchActive: (active: boolean) => void;
  togglePendingRelationship: (nodeId: string) => void;
  savePendingRelationships: () => void;
  setEditModeValidationErrors: (errors: EditModeValidationErrors) => void;

  // Copilot mode state management
  copilotMode: CopilotModeState;
  startCopilotMode: (conversationPartner: DreamNode) => void;
  exitCopilotMode: () => void;
  setShowSearchResults: (show: boolean) => void;
  freezeSearchResults: () => void;
  addSharedNode: (nodeId: string) => void;

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
  restoreVisualState: (entry: NavigationHistoryEntry) => void;
  
  // DreamNode flip animation state
  flipState: {
    flippedNodeId: string | null;
    flipStates: Map<string, FlipState>;
  };
  setFlippedNode: (nodeId: string | null) => void;
  startFlipAnimation: (nodeId: string, direction: 'front-to-back' | 'back-to-front') => void;
  completeFlipAnimation: (nodeId: string) => void;
  resetAllFlips: () => void;
  getNodeFlipState: (nodeId: string) => FlipState | null;

  // DreamSong relationship graph state
  constellationData: {
    relationshipGraph: DreamSongRelationshipGraph | null;
    lastScanTimestamp: number | null;
    isScanning: boolean;
    positions: Map<string, [number, number, number]> | null;
    lastLayoutTimestamp: number | null;
    // Lightweight node metadata for instant startup rendering
    nodeMetadata: Map<string, { name: string; type: string; uuid: string }> | null;
  };
  setRelationshipGraph: (graph: DreamSongRelationshipGraph | null) => void;
  setConstellationScanning: (scanning: boolean) => void;
  setConstellationPositions: (positions: Map<string, [number, number, number]> | null) => void;
  setNodeMetadata: (metadata: Map<string, { name: string; type: string; uuid: string }> | null) => void;
  clearConstellationData: () => void;

  // Radial button UI state (option-key triggered)
  radialButtonUI: {
    isActive: boolean;
    buttonCount: number;
    optionKeyPressed: boolean; // Track actual hardware key state
  };
  setRadialButtonUIActive: (active: boolean) => void;
  setRadialButtonCount: (count: number) => void;
  setOptionKeyPressed: (pressed: boolean) => void;

  // Update status for DreamNodes (non-persisted)
  updateStatus: Map<string, import('../services/git-service').FetchResult>;
  setNodeUpdateStatus: (nodeId: string, result: import('../services/git-service').FetchResult) => void;
  clearNodeUpdateStatus: (nodeId: string) => void;
  getNodeUpdateStatus: (nodeId: string) => import('../services/git-service').FetchResult | null;
}

// Helper to convert Map to serializable format for persistence
const mapToArray = <K, V>(map: Map<K, V>): [K, V][] => Array.from(map.entries());
const arrayToMap = <K, V>(array: [K, V][]): Map<K, V> => new Map(array);

export const useInterBrainStore = create<InterBrainState>()(
  persist(
    (set, get) => ({
  // Initial state
  dataMode: 'real' as const, // Start in real mode by default
  realNodes: new Map<string, RealNodeData>(),
  
  // Initialize Ollama config slice
  ...createOllamaConfigSlice(set, get, {} as never),
  selectedNode: null,
  selectedNodeDreamSongData: null,

  // DreamSong cache for service layer
  dreamSongCache: new Map<string, DreamSongCacheEntry>(),

  creatorMode: {
    isActive: false,
    nodeId: null
  },
  searchResults: [],
  searchInterface: {
    isActive: false,
    isSaving: false,
    currentQuery: '',
    lastQuery: ''
  },
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
  
  // Edit mode initial state (not editing)
  editMode: {
    isActive: false,
    editingNode: null,
    originalRelationships: [],
    pendingRelationships: [],
    searchResults: [],
    validationErrors: {},
    isSearchingRelationships: false
  },

  // Copilot mode initial state (not active)
  copilotMode: {
    isActive: false,
    conversationPartner: null,
    transcriptionFilePath: null,
    showSearchResults: false,
    frozenSearchResults: [],
    sharedNodeIds: []
  },

  // Navigation history initial state (with initial constellation state)
  navigationHistory: {
    history: [{
      nodeId: null,
      layout: 'constellation',
      timestamp: Date.now(),
      flipState: null,
      scrollPosition: null
    }],
    currentIndex: 0, // Start at the initial constellation state
    maxHistorySize: 150 // High limit for ultra-lightweight entries
  },
  
  // Flag to disable history tracking during undo/redo operations
  isRestoringFromHistory: false,
  
  // DreamNode flip animation initial state
  flipState: {
    flippedNodeId: null,
    flipStates: new Map<string, FlipState>()
  },

  // Constellation relationship graph initial state
  constellationData: {
    relationshipGraph: null,
    lastScanTimestamp: null,
    isScanning: false,
    positions: null,
    lastLayoutTimestamp: null,
    nodeMetadata: null
  },

  radialButtonUI: {
    isActive: false,
    buttonCount: 6,
    optionKeyPressed: false
  },

  // Actions
  setDataMode: (mode) => set({ dataMode: mode }),
  setRealNodes: (nodes) => set({ realNodes: nodes }),
  updateRealNode: (id, data) => set(state => {
    const newMap = new Map(state.realNodes);
    newMap.set(id, data);
    return { realNodes: newMap };
  }),
  batchUpdateNodePositions: (positions) => set(state => {
    const newMap = new Map(state.realNodes);
    for (const [nodeId, position] of positions) {
      const nodeData = newMap.get(nodeId);
      if (nodeData) {
        newMap.set(nodeId, {
          ...nodeData,
          node: { ...nodeData.node, position }
        });
      }
    }
    return { realNodes: newMap };
  }),
  deleteRealNode: (id) => set(state => {
    const newMap = new Map(state.realNodes);
    newMap.delete(id);
    return { realNodes: newMap };
  }),
  
  // Note: Vector data and Ollama config actions provided by OllamaConfigSlice
  
  setSelectedNode: (node) => set(state => {
    const previousNode = state.selectedNode;
    const currentLayout = state.spatialLayout;

    // Trigger lazy media loading for node and 2-degree neighborhood
    if (node) {
      // Import and trigger media loading asynchronously (non-blocking)
      import('../services/media-loading-service').then(({ getMediaLoadingService }) => {
        try {
          const mediaLoadingService = getMediaLoadingService();
          mediaLoadingService.loadNodeWithNeighborhood(node.id);
        } catch (error) {
          console.warn('[Store] MediaLoadingService not initialized:', error);
        }
      }).catch(error => {
        console.error('[Store] Failed to load media service:', error);
      });
    }

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
        timestamp: Date.now(),
        flipState: state.flipState.flipStates.get(node.id) || null,
        scrollPosition: getDreamSongScrollPosition(node.id) // We'll implement this helper
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
  
  setSelectedNodeDreamSongData: (data) => set({ selectedNodeDreamSongData: data }),

  // DreamSong cache methods for service layer
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

  setCreatorMode: (active, nodeId = null) => set({ 
    creatorMode: { isActive: active, nodeId: nodeId } 
  }),
  setSearchResults: (results) => set({ searchResults: results }),
  setSearchActive: (active) => set(state => ({
    searchInterface: {
      ...state.searchInterface,
      isActive: active,
      // Clear query when deactivating for fresh start on reentry
      currentQuery: active ? state.searchInterface.currentQuery : '',
      lastQuery: active ? state.searchInterface.lastQuery : ''
    },
    // Also clear search results when deactivating
    searchResults: active ? state.searchResults : []
  })),
  setSearchQuery: (query) => set(state => ({
    searchInterface: {
      ...state.searchInterface,
      currentQuery: query
    }
  })),
  setSearchSaving: (saving) => set(state => ({
    searchInterface: {
      ...state.searchInterface,
      isSaving: saving
    }
  })),
  setSpatialLayout: (layout) => set(state => {
    const previousLayout = state.spatialLayout;
    const selectedNode = state.selectedNode;
    
    // Only log actual changes, not redundant calls
    if (previousLayout !== layout) {
    }
    
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
        timestamp: Date.now(),
        flipState: (layout === 'liminal-web' && selectedNode) ? 
          state.flipState.flipStates.get(selectedNode.id) || null : null,
        scrollPosition: (layout === 'liminal-web' && selectedNode) ? 
          getDreamSongScrollPosition(selectedNode.id) : null
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
      
      // Use deterministic pattern for consistent relationships with more variety
      const stepSizes = [1, 2, 3, 5, 7, 11, 13, 17, 19];
      
      // Create more diversity in connection counts based on node index
      const baseConnections = 2;
      const variabilityFactor = ((i * 13) % 17) / 17; // 0 to 1, varies by node
      const maxConnections = Math.min(
        Math.floor(nodeCount * 0.8), // Up to 80% of opposite-type nodes
        baseConnections + Math.floor(variabilityFactor * Math.min(25, nodeCount - baseConnections))
      );
      
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
  startCreation: (position) => set((_state) => {
    return {
      spatialLayout: 'creation',
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
    };
  }),
  
  startCreationWithData: (position, initialData) => set((_state) => {
    return {
      spatialLayout: 'creation',
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
    };
  }),
  
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
  
  completeCreation: () => set((_state) => {
    return {
      spatialLayout: 'constellation',
      creationState: {
        isCreating: false,
        protoNode: null,
        validationErrors: {}
      }
    };
  }),
  
  cancelCreation: () => set((_state) => {
    return {
      spatialLayout: 'constellation',
      creationState: {
        isCreating: false,
        protoNode: null,
        validationErrors: {}
      }
    };
  }),

  // Edit mode actions
  startEditMode: (node) => set((_state) => {
    return {
      editMode: {
        isActive: true,
        editingNode: { ...node }, // Create a copy to avoid mutations
        originalRelationships: [...node.liminalWebConnections], // Store original relationships
        pendingRelationships: [...node.liminalWebConnections], // Show existing relationships with glow
        searchResults: [],
        validationErrors: {},
        isSearchingRelationships: false
      },
      // Also set the spatial layout to 'edit' mode
      spatialLayout: 'edit' as const
    };
  }),

  exitEditMode: () => set((_state) => {
    // Note: We don't change the layout here - the calling code should handle that
    // This allows for proper transitions (edit → liminal-web, edit-search → edit, etc.)
    
    return {
      editMode: {
        isActive: false,
        editingNode: null,
        originalRelationships: [],
        pendingRelationships: [],
        searchResults: [],
        validationErrors: {},
        newDreamTalkFile: undefined,
        isSearchingRelationships: false
      }
    };
  }),

  updateEditingNodeMetadata: (updates) => set(state => ({
    editMode: {
      ...state.editMode,
      editingNode: state.editMode.editingNode
        ? { ...state.editMode.editingNode, ...updates }
        : null
    }
  })),

  setEditModeNewDreamTalkFile: (file) => set(state => ({
    editMode: {
      ...state.editMode,
      newDreamTalkFile: file
    }
  })),

  setEditModeSearchResults: (results) => set(state => ({
    editMode: {
      ...state.editMode,
      searchResults: results
    }
  })),

  setEditModeSearchActive: (active) => set(state => {
    const newLayout = active ? 'edit-search' as const : 'edit' as const;

    return {
      editMode: {
        ...state.editMode,
        isSearchingRelationships: active,
        // Clear search results when exiting edit-search mode to prevent persistence
        searchResults: active ? state.editMode.searchResults : []
      },
      // Update spatial layout based on search mode state
      spatialLayout: newLayout,
      // Also clear main search results when exiting edit-search to clean up spatial layout
      searchResults: active ? state.searchResults : []
    };
  }),

  togglePendingRelationship: (nodeId) => set(state => {
    const currentPending = state.editMode.pendingRelationships;
    const isAlreadyPending = currentPending.includes(nodeId);
    
    return {
      editMode: {
        ...state.editMode,
        pendingRelationships: isAlreadyPending
          ? currentPending.filter(id => id !== nodeId) // Remove if exists
          : [...currentPending, nodeId] // Add if doesn't exist
      }
    };
  }),

  savePendingRelationships: () => set(state => {
    if (!state.editMode.editingNode) return state;

    // Update the editing node with pending relationships
    const updatedNode = {
      ...state.editMode.editingNode,
      liminalWebConnections: [...state.editMode.pendingRelationships]
    };

    return {
      editMode: {
        ...state.editMode,
        editingNode: updatedNode,
        originalRelationships: [...state.editMode.pendingRelationships] // Update original to match
      }
    };
  }),

  setEditModeValidationErrors: (errors) => set(state => ({
    editMode: {
      ...state.editMode,
      validationErrors: errors
    }
  })),

  // Copilot mode actions
  startCopilotMode: (conversationPartner) => set((_state) => {
    // Hide ribbon for cleaner video call interface
    try {
      const app = (globalThis as any).app;
      if (app?.workspace?.leftRibbon) {
        app.workspace.leftRibbon.hide();
        console.log(`🎯 [Copilot-Entry] Hidden ribbon for cleaner interface`);
      }
    } catch (error) {
      console.warn('Failed to hide ribbon:', error);
    }

    return {
      spatialLayout: 'copilot',
      copilotMode: {
        isActive: true,
        conversationPartner: { ...conversationPartner }, // Create a copy
        transcriptionFilePath: null,
        showSearchResults: false,
        frozenSearchResults: [],
        sharedNodeIds: []
      }
    };
  }),

  exitCopilotMode: () => set((state) => {
    // PROCESS SHARED NODES BEFORE CLEARING STATE
    const { conversationPartner, sharedNodeIds } = state.copilotMode;

    if (conversationPartner && sharedNodeIds.length > 0) {
      console.log(`🔗 [Copilot-Exit] Processing ${sharedNodeIds.length} shared nodes for "${conversationPartner.name}"`);
      console.log(`🔗 [Copilot-Exit] Shared node IDs: ${sharedNodeIds.join(', ')}`);

      // Filter out nodes that are already related to avoid duplicates
      const newRelationships = sharedNodeIds.filter(id => !conversationPartner.liminalWebConnections.includes(id));

      if (newRelationships.length > 0) {
        // Create updated conversation partner with new relationships
        const updatedPartner = {
          ...conversationPartner,
          liminalWebConnections: [...conversationPartner.liminalWebConnections, ...newRelationships]
        };

        console.log(`✅ [Copilot-Exit] Adding ${newRelationships.length} new relationships: ${newRelationships.join(', ')}`);
        console.log(`✅ [Copilot-Exit] "${conversationPartner.name}" now has ${updatedPartner.liminalWebConnections.length} total relationships`);

        // Update the conversation partner node in store
        const existingNodeData = state.realNodes.get(conversationPartner.id);
        if (existingNodeData) {
          state.realNodes.set(conversationPartner.id, {
            ...existingNodeData,
            node: updatedPartner
          });
        }

        // Also update selectedNode if it matches the conversation partner
        if (state.selectedNode?.id === conversationPartner.id) {
          state.selectedNode = updatedPartner;
        }

        // Update bidirectional relationships in store for immediate UI feedback
        for (const sharedNodeId of newRelationships) {
          const sharedNodeData = state.realNodes.get(sharedNodeId);
          if (sharedNodeData) {
            const updatedSharedNode = {
              ...sharedNodeData.node,
              liminalWebConnections: [...sharedNodeData.node.liminalWebConnections, conversationPartner.id]
            };
            state.realNodes.set(sharedNodeId, {
              ...sharedNodeData,
              node: updatedSharedNode
            });
            console.log(`✅ [Copilot-Exit] Updated bidirectional relationship for shared node: ${updatedSharedNode.name}`);
          }
        }
      } else {
        console.log(`ℹ️ [Copilot-Exit] No new relationships to add - all shared nodes were already related`);
      }
    }

    // Show ribbon again when exiting copilot mode
    try {
      const app = (globalThis as any).app;
      if (app?.workspace?.leftRibbon) {
        app.workspace.leftRibbon.show();
        console.log(`🎯 [Copilot-Exit] Restored ribbon visibility`);
      }
    } catch (error) {
      console.warn('Failed to show ribbon:', error);
    }

    return {
      spatialLayout: 'liminal-web', // Return to liminal-web layout with updated relationships
      copilotMode: {
        isActive: false,
        conversationPartner: null,
        transcriptionFilePath: null,
        showSearchResults: false,
        frozenSearchResults: [],
        sharedNodeIds: []
      }
    };
  }),

  // Copilot show/hide actions
  setShowSearchResults: (show: boolean) => set((state) => ({
    copilotMode: {
      ...state.copilotMode,
      showSearchResults: show
    }
  })),

  freezeSearchResults: () => set((state) => ({
    copilotMode: {
      ...state.copilotMode,
      frozenSearchResults: [...state.searchResults] // Capture current search results
    }
  })),

  addSharedNode: (nodeId: string) => set((state) => ({
    copilotMode: {
      ...state.copilotMode,
      sharedNodeIds: [...state.copilotMode.sharedNodeIds, nodeId]
    }
  })),

  // Navigation history actions
  addHistoryEntry: (nodeId, layout) => set(state => {
    const { history, currentIndex, maxHistorySize } = state.navigationHistory;
    
    // Create new entry
    const newEntry: NavigationHistoryEntry = {
      nodeId,
      layout,
      timestamp: Date.now(),
      flipState: (nodeId && layout === 'liminal-web') ? 
        state.flipState.flipStates.get(nodeId) || null : null,
      scrollPosition: (nodeId && layout === 'liminal-web') ? 
        getDreamSongScrollPosition(nodeId) : null
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
  
  restoreVisualState: (entry) => set((state) => {
    const newState = { ...state };

    // Restore FlipState if present
    if (entry.nodeId && entry.flipState) {
      // Update the flip state for this node
      const updatedFlipStates = new Map(state.flipState.flipStates);
      updatedFlipStates.set(entry.nodeId, entry.flipState);

      newState.flipState = {
        ...state.flipState,
        flipStates: updatedFlipStates,
        flippedNodeId: entry.flipState.isFlipped ? entry.nodeId : state.flipState.flippedNodeId
      };
    }

    // Restore scroll position (async, but we don't wait for it)
    if (entry.nodeId && entry.scrollPosition !== null) {
      // Use setTimeout to ensure DOM has updated after state change
      if (typeof setTimeout !== 'undefined') {
         
        setTimeout(() => {
          restoreDreamSongScrollPosition(entry.nodeId!, entry.scrollPosition!);
        }, 100);
      } else {
        // Fallback for non-browser environments
        restoreDreamSongScrollPosition(entry.nodeId!, entry.scrollPosition!);
      }
    }

    return newState;
  }),
  
  // DreamNode flip animation actions
  setFlippedNode: (nodeId) => set((state) => {
    
    // Reset previous flipped node if different
    if (state.flipState.flippedNodeId && state.flipState.flippedNodeId !== nodeId) {
      const updatedFlipStates = new Map(state.flipState.flipStates);
      updatedFlipStates.delete(state.flipState.flippedNodeId);
      
      return {
        flipState: {
          flippedNodeId: nodeId,
          flipStates: updatedFlipStates
        }
      };
    }
    
    return {
      flipState: {
        ...state.flipState,
        flippedNodeId: nodeId
      }
    };
  }),
  
  startFlipAnimation: (nodeId, direction) => set((state) => {
    
    const updatedFlipStates = new Map(state.flipState.flipStates);
    
    const currentFlipState = updatedFlipStates.get(nodeId) || {
      isFlipped: false,
      isFlipping: false,
      flipDirection: 'front-to-back' as const,
      animationStartTime: 0
    };
    
    const newFlipState = {
      ...currentFlipState,
      isFlipping: true,
      flipDirection: direction,
      animationStartTime: globalThis.performance.now()
    };
    
    updatedFlipStates.set(nodeId, newFlipState);

    return {
      ...state,
      flipState: {
        ...state.flipState,
        flipStates: updatedFlipStates,
        flippedNodeId: nodeId
      }
    };
  }),
  
  completeFlipAnimation: (nodeId) => set((state) => {
    
    const updatedFlipStates = new Map(state.flipState.flipStates);
    const currentFlipState = updatedFlipStates.get(nodeId);
    
    if (currentFlipState) {
      const finalFlippedState = currentFlipState.flipDirection === 'front-to-back';
      const completedFlipState = {
        ...currentFlipState,
        isFlipped: finalFlippedState,
        isFlipping: false,
        animationStartTime: 0
      };
      
      updatedFlipStates.set(nodeId, completedFlipState);
    }
    
    return {
      flipState: {
        ...state.flipState,
        flipStates: updatedFlipStates
      }
    };
  }),
  
  resetAllFlips: () => set(() => ({
    flipState: {
      flippedNodeId: null,
      flipStates: new Map<string, FlipState>()
    }
  })),
  
  getNodeFlipState: (nodeId) => {
    const state = get();
    return state.flipState.flipStates.get(nodeId) || null;
  },

  // Constellation relationship graph actions
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
    constellationData: {
      relationshipGraph: null,
      lastScanTimestamp: null,
      isScanning: false,
      positions: null,
      lastLayoutTimestamp: null,
      nodeMetadata: null
    }
  })),

  setRadialButtonUIActive: (active) => set((state) => ({
    radialButtonUI: {
      ...state.radialButtonUI,
      isActive: active
    }
  })),

  setRadialButtonCount: (count) => set((state) => ({
    radialButtonUI: {
      ...state.radialButtonUI,
      buttonCount: count
    }
  })),

  setOptionKeyPressed: (pressed) => set((state) => ({
    radialButtonUI: {
      ...state.radialButtonUI,
      optionKeyPressed: pressed
    }
  })),

  // Update status management (non-persisted)
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
    }),
    {
      name: 'interbrain-storage', // Storage key
      // Only persist real nodes data, data mode, vector data, mock relationships, constellation data, and Ollama config
      partialize: (state) => ({
        dataMode: state.dataMode,
        // Don't persist realNodes at all - they reload from vault on app start
        // This avoids localStorage quota issues entirely
        realNodes: [],
        mockRelationshipData: state.mockRelationshipData ? mapToArray(state.mockRelationshipData) : null,
        constellationData: (state.constellationData.relationshipGraph || state.constellationData.positions || state.constellationData.nodeMetadata) ? {
          ...state.constellationData,
          relationshipGraph: state.constellationData.relationshipGraph ?
            serializeRelationshipGraph(state.constellationData.relationshipGraph) : null,
          positions: state.constellationData.positions ?
            mapToArray(state.constellationData.positions) : null,
          nodeMetadata: state.constellationData.nodeMetadata ?
            mapToArray(state.constellationData.nodeMetadata) : null
        } : null,
        ...extractOllamaPersistenceData(state),
      }),
      // Custom merge function to handle Map deserialization
      merge: (persisted: unknown, current) => {
        const persistedData = persisted as {
          dataMode: 'mock' | 'real';
          realNodes: [string, RealNodeData][];
          mockRelationshipData: [string, string[]][] | null;
          constellationData?: {
            relationshipGraph: SerializableDreamSongGraph | null;
            lastScanTimestamp: number | null;
            isScanning: boolean;
            positions: [string, [number, number, number]][] | null;
            lastLayoutTimestamp: number | null;
            nodeMetadata: [string, { name: string; type: string; uuid: string }][] | null;
          } | null;
          vectorData?: [string, VectorData][];
          ollamaConfig?: OllamaConfig;
        };

        // Restore constellation data if present
        let constellationData = {
          relationshipGraph: null as DreamSongRelationshipGraph | null,
          lastScanTimestamp: null as number | null,
          isScanning: false,
          positions: null as Map<string, [number, number, number]> | null,
          lastLayoutTimestamp: null as number | null,
          nodeMetadata: null as Map<string, { name: string; type: string; uuid: string }> | null
        };

        if (persistedData.constellationData) {
          try {
            constellationData = {
              relationshipGraph: persistedData.constellationData.relationshipGraph ?
                deserializeRelationshipGraph(persistedData.constellationData.relationshipGraph) : null,
              lastScanTimestamp: persistedData.constellationData.lastScanTimestamp,
              isScanning: false,
              positions: persistedData.constellationData.positions ?
                arrayToMap(persistedData.constellationData.positions) : null,
              lastLayoutTimestamp: persistedData.constellationData.lastLayoutTimestamp,
              nodeMetadata: persistedData.constellationData.nodeMetadata ?
                arrayToMap(persistedData.constellationData.nodeMetadata) : null
            };
          } catch (error) {
            console.warn('Failed to deserialize constellation data:', error);
            // Keep default null state
          }
        }

        return {
          ...current,
          dataMode: persistedData.dataMode || 'mock',
          realNodes: persistedData.realNodes ? arrayToMap(persistedData.realNodes) : new Map(),
          mockRelationshipData: persistedData.mockRelationshipData ? arrayToMap(persistedData.mockRelationshipData) : null,
          constellationData,
          ...restoreOllamaPersistenceData(persistedData),
        };
      },
    }
  )
);

// DIAGNOSTIC: Log all store updates to identify re-render storm trigger
if (typeof window !== 'undefined') {
  let updateCount = 0;
  useInterBrainStore.subscribe((state, prevState) => {
    updateCount++;

    // Diagnostic logging disabled
  });
}