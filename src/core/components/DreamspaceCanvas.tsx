import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Group, Vector3, Raycaster, Sphere, Mesh } from 'three';
import { FlyControls } from '@react-three/drei';
import { getMockDataForConfig } from '../mock/dreamnode-mock-data';
import DreamNode3D, { DreamNode3DRef } from './DreamNode3D';
import Star3D from './Star3D';
import SphereRotationControls from './SphereRotationControls';
import SpatialOrchestrator, { SpatialOrchestratorRef } from './SpatialOrchestrator';
import ProtoNode3D from '../../features/creation/ProtoNode3D';
import SearchNode3D from '../../features/search/SearchNode3D';
import SearchOrchestrator from '../../features/search/SearchOrchestrator';
import { EditModeOverlay } from '../../features/edit-mode';
import CopilotModeOverlay from '../../features/conversational-copilot/CopilotModeOverlay';
import ConstellationEdges, { shouldShowConstellationEdges } from '../../features/constellation/ConstellationEdges';
import { RadialButtonRing3D } from '../../features/radial-buttons/RadialButtonRing3D';
import { ActiveVideoCallButton } from '../../features/radial-buttons/ActiveVideoCallButton';
import { DreamNode } from '../types/dreamnode';
import { useInterBrainStore, ProtoNode } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';
import { UIService } from '../services/ui-service';
import { VaultService } from '../services/vault-service';
import { CanvasParserService } from '../../features/dreamweaving/services/canvas-parser-service';
import { CAMERA_INTERSECTION_POINT } from '../layouts/DynamicViewScaling';
import { processDroppedUrlData } from '../utils/url-utils';

// Create singleton service instances
const uiService = new UIService();

export default function DreamspaceCanvas() {
  // Get services inside component so they're available after plugin initialization
  const [vaultService, setVaultService] = useState<VaultService | undefined>(undefined);
  const [canvasParserService, setCanvasParserService] = useState<CanvasParserService | undefined>(undefined);
  
  // Load services on component mount (after plugin has initialized)
  useEffect(() => {
    try {
      const vault = serviceManager.getVaultService() || undefined;
      const canvas = serviceManager.getCanvasParserService() || undefined;
      setVaultService(vault);
      setCanvasParserService(canvas);
    } catch {
      console.log('Services not available, flip functionality will be disabled');
    }
  }, []); // Run once on mount
  
  // Get data mode and mock data configuration from store
  const dataMode = useInterBrainStore(state => state.dataMode);
  const mockDataConfig = useInterBrainStore(state => state.mockDataConfig);
  const mockRelationshipData = useInterBrainStore(state => state.mockRelationshipData);
  const realNodes = useInterBrainStore(state => state.realNodes);
  
  // State for dynamic nodes from mock service
  const [dynamicNodes, setDynamicNodes] = useState<DreamNode[]>([]);
  
  // Effect to load initial mock nodes and listen for changes
  useEffect(() => {
    if (dataMode === 'mock') {
      // Load initial nodes
      const loadMockNodes = async () => {
        const service = serviceManager.getActive();
        const nodes = await service.list();
        setDynamicNodes(nodes);
      };
      loadMockNodes();
      
      // Listen for mock node changes
      const handleMockNodesChanged = async () => {
        console.log('DreamspaceCanvas: Mock nodes changed, refreshing...');
        const service = serviceManager.getActive();
        const nodes = await service.list();
        setDynamicNodes(nodes);
      };
      
      if (typeof globalThis.addEventListener !== 'undefined') {
        globalThis.addEventListener('mock-nodes-changed', handleMockNodesChanged);
        
        return () => {
          globalThis.removeEventListener('mock-nodes-changed', handleMockNodesChanged);
        };
      }
    }
    
    // Always return a cleanup function (even if it does nothing)
    return () => {};
  }, [dataMode]);

  // Single, centralized escape key handler with debouncing for unified spatialLayout state
  useEffect(() => {
    let debounceTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
    
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      
      e.preventDefault();
      
      // Debounce rapid escape key presses (300ms)
      if (debounceTimeout) {
        globalThis.clearTimeout(debounceTimeout);
      }
      
      debounceTimeout = globalThis.setTimeout(() => {
        const store = useInterBrainStore.getState();
        const layout = store.spatialLayout;
        
        
        // Complete hierarchical navigation for all states
        switch (layout) {
          case 'creation':
            // Hide radial buttons when exiting creation mode
            if (store.radialButtonUI.isActive) {
              store.setRadialButtonUIActive(false);
            }

            // Exit creation mode, return to constellation
            store.cancelCreation(); // This sets layout to 'constellation'
            break;
            
          case 'edit-search':
            // Exit search mode, stay in edit mode
            store.setEditModeSearchActive(false); // This will set layout to 'edit'
            break;
            
          case 'edit':
            // Exit edit mode, go to liminal-web
            store.exitEditMode();
            store.setSpatialLayout('liminal-web');

            // Only show radial buttons if option key is ACTUALLY pressed
            // This prevents buttons from appearing when exiting edit mode with escape
            if (store.radialButtonUI.optionKeyPressed) {
              store.setRadialButtonUIActive(true);
              if (spatialOrchestratorRef.current) {
                spatialOrchestratorRef.current.hideRelatedNodesInLiminalWeb();
              }
            } else {
              store.setRadialButtonUIActive(false);
            }
            break;
            
          case 'search':
            // Exit global search, go to constellation
            store.setSearchResults([]);
            store.setSpatialLayout('constellation');
            break;
            
          case 'copilot':
            // Exit copilot mode, go to liminal-web
            store.exitCopilotMode();
            break;

          case 'liminal-web':
            // Exit liminal-web, go to constellation
            store.setSelectedNode(null);
            store.setSpatialLayout('constellation');
            break;

          case 'constellation':
            // Already at top level
            console.log(`🌌 Already in constellation (root)`);
            break;
        }
        
        debounceTimeout = null;
      }, 300); // 300ms debounce to prevent rapid state changes
    };
    
    globalThis.document.addEventListener('keydown', handleEscape);
    
    return () => {
      if (debounceTimeout) {
        globalThis.clearTimeout(debounceTimeout);
      }
      globalThis.document.removeEventListener('keydown', handleEscape);
    };
  }, []); // Single handler, no dependencies

  // Drag and drop state
  const [, setIsDragOver] = useState(false); // Keep for state management but remove unused variable warning
  const [dragMousePosition, setDragMousePosition] = useState<{ x: number; y: number } | null>(null);
  
  // Get nodes based on data mode
  let dreamNodes: DreamNode[] = [];
  if (dataMode === 'mock') {
    // Combine static mock data with dynamic service nodes
    const staticNodes = getMockDataForConfig(mockDataConfig, mockRelationshipData || undefined);
    dreamNodes = [...staticNodes, ...dynamicNodes];
  } else {
    // Real mode: use realNodes from store
    dreamNodes = Array.from(realNodes.values()).map(data => data.node);
  }
  
  // Reference to the group containing all DreamNodes for rotation
  const dreamWorldRef = useRef<Group>(null);

  // Track when DreamNodes are actually rendered in DOM (for debugging)
  // useEffect(() => {
  //   if (dreamNodes.length > 0) {
  //     console.log(`[DreamNodeRendering] 🎯 useEffect fired - ${dreamNodes.length} dreamNodes`);
  //   }
  // }, [dreamNodes.length]);
  
  // Hit sphere references for scene-based raycasting
  const hitSphereRefs = useRef<Map<string, React.RefObject<Mesh | null>>>(new Map());
  
  // DreamNode3D references for movement commands  
  const dreamNodeRefs = useRef<Map<string, React.RefObject<DreamNode3DRef | null>>>(new Map());
  
  // SpatialOrchestrator reference for controlling all spatial interactions
  const spatialOrchestratorRef = useRef<SpatialOrchestratorRef>(null);
  
  // Debug visualization states from store
  const debugWireframeSphere = useInterBrainStore(state => state.debugWireframeSphere);
  const debugIntersectionPoint = useInterBrainStore(state => state.debugIntersectionPoint);
  const debugFlyingControls = useInterBrainStore(state => state.debugFlyingControls);
  
  // Layout state for controlling dynamic view scaling
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);
  
  // Search results for search mode display
  const searchResults = useInterBrainStore(state => state.searchResults);
  const selectedNode = useInterBrainStore(state => state.selectedNode);

  // Copilot mode state for transcription buffer
  const copilotMode = useInterBrainStore(state => state.copilotMode);

  // Search interface state
  const searchInterface = useInterBrainStore(state => state.searchInterface);

  // Radial button UI state
  const radialButtonUI = useInterBrainStore(state => state.radialButtonUI);

  // Track whether radial button component should be mounted (for exit animation)
  const [shouldMountRadialButtons, setShouldMountRadialButtons] = useState(false);

  // Mount/unmount radial button component based on isActive and animation completion
  useEffect(() => {
    if (radialButtonUI.isActive) {
      setShouldMountRadialButtons(true);
    }
    // Unmount happens via onExitComplete callback
  }, [radialButtonUI.isActive]);

  // Option key handler for copilot mode show/hide
  useEffect(() => {
    if (spatialLayout !== 'copilot') return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Option key on Mac, Alt key on Windows/Linux
      if (e.altKey && !copilotMode.showSearchResults) {
        e.preventDefault();
        console.log('🔍 [Copilot] Option key pressed - showing search results');
        const store = useInterBrainStore.getState();

        console.log('🔍 [Copilot] Current searchResults:', store.searchResults.length, store.searchResults.map(n => n.name));
        console.log('🔍 [Copilot] Current frozenSearchResults BEFORE freeze:', store.copilotMode.frozenSearchResults.length, store.copilotMode.frozenSearchResults.map(n => n.name));

        store.freezeSearchResults(); // Capture latest search results
        store.setShowSearchResults(true);

        // Trigger layout update to show frozen results
        if (spatialOrchestratorRef.current && store.copilotMode.conversationPartner) {
          // Force the layout to update with frozen results by calling showEditModeSearchResults
          // This ensures the display logic runs even if no new search results are coming in
          // Get fresh state after freezeSearchResults() was called
          const updatedStore = useInterBrainStore.getState();
          const frozenResults = updatedStore.copilotMode.frozenSearchResults;
          console.log('🔍 [Copilot] frozenSearchResults AFTER freeze:', frozenResults.length, frozenResults.map(n => n.name));

          if (frozenResults && frozenResults.length > 0) {
            console.log(`🔍 [Copilot] Displaying ${frozenResults.length} frozen search results`);
            spatialOrchestratorRef.current.showEditModeSearchResults(store.copilotMode.conversationPartner.id, frozenResults);
          } else {
            console.log('🔍 [Copilot] No frozen results to display');
          }
        }
      }
    };

    const handleKeyUp = (e: globalThis.KeyboardEvent) => {
      // Detect when Option/Alt key is released
      if (!e.altKey && copilotMode.showSearchResults) {
        console.log('🔍 [Copilot] Option key released - hiding search results');
        const store = useInterBrainStore.getState();
        store.setShowSearchResults(false);

        // Trigger layout update to hide results by calling with empty array
        if (spatialOrchestratorRef.current && store.copilotMode.conversationPartner) {
          console.log('🔍 [Copilot] Hiding search results - clearing layout');
          spatialOrchestratorRef.current.showEditModeSearchResults(store.copilotMode.conversationPartner.id, []);
        }
      }
    };

    globalThis.document.addEventListener('keydown', handleKeyDown);
    globalThis.document.addEventListener('keyup', handleKeyUp);

    return () => {
      globalThis.document.removeEventListener('keydown', handleKeyDown);
      globalThis.document.removeEventListener('keyup', handleKeyUp);
    };
  }, [spatialLayout, copilotMode.showSearchResults]);

  // Option key handler for radial button UI in liminal-web mode
  // Coordinated animation: buttons appear + related nodes hide (and vice versa)
  // ARCHITECTURE: Track actual hardware key state separately from UI visibility
  useEffect(() => {
    if (spatialLayout !== 'liminal-web' || !selectedNode) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Option key on Mac, Alt key on Windows/Linux
      if (e.altKey) {
        e.preventDefault();
        const store = useInterBrainStore.getState();

        // Always track the hardware key state
        if (!store.radialButtonUI.optionKeyPressed) {
          store.setOptionKeyPressed(true);
        }

        // Only show buttons if not already showing
        if (!store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(true);

          // Hide related nodes by moving them to constellation
          if (spatialOrchestratorRef.current) {
            spatialOrchestratorRef.current.hideRelatedNodesInLiminalWeb();
          }
        }
      }
    };

    const handleKeyUp = (e: globalThis.KeyboardEvent) => {
      // Detect when Option/Alt key is released
      if (!e.altKey) {
        const store = useInterBrainStore.getState();

        // Always clear the hardware key state
        if (store.radialButtonUI.optionKeyPressed) {
          store.setOptionKeyPressed(false);
        }

        // Only hide buttons if they're currently showing
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);

          // Show related nodes by moving them back to ring positions
          if (spatialOrchestratorRef.current) {
            spatialOrchestratorRef.current.showRelatedNodesInLiminalWeb();
          }
        }
      }
    };

    globalThis.document.addEventListener('keydown', handleKeyDown);
    globalThis.document.addEventListener('keyup', handleKeyUp);

    return () => {
      globalThis.document.removeEventListener('keydown', handleKeyDown);
      globalThis.document.removeEventListener('keyup', handleKeyUp);
    };
  }, [spatialLayout, selectedNode]);

  // Creation state for proto-node rendering
  const { creationState, startCreationWithData, completeCreation, cancelCreation } = useInterBrainStore();
  
  // Helper function to get or create DreamNode3D ref
  const getDreamNodeRef = (nodeId: string): React.RefObject<DreamNode3DRef | null> => {
    let nodeRef = dreamNodeRefs.current.get(nodeId);
    if (!nodeRef) {
      nodeRef = React.createRef<DreamNode3DRef>();
      dreamNodeRefs.current.set(nodeId, nodeRef);
      
      // Register with orchestrator (need to cast to non-null type)
      if (spatialOrchestratorRef.current && nodeRef) {
        spatialOrchestratorRef.current.registerNodeRef(nodeId, nodeRef as React.RefObject<DreamNode3DRef>);
      }
    }
    return nodeRef;
  };
  
  // Register all existing refs with orchestrator when it becomes ready
  useEffect(() => {
    if (spatialOrchestratorRef.current) {
      dreamNodeRefs.current.forEach((nodeRef, nodeId) => {
        if (nodeRef) {
          spatialOrchestratorRef.current?.registerNodeRef(nodeId, nodeRef as React.RefObject<DreamNode3DRef>);
        }
      });
    }
  }, [dreamNodes.length, spatialOrchestratorRef.current]); // Re-register when nodes change OR orchestrator becomes ready
  
  // Expose moveToCenter function globally for commands
  useEffect(() => {
    (globalThis as unknown as { __interbrainCanvas: unknown }).__interbrainCanvas = {
      moveSelectedNodeToCenter: () => {
        const store = useInterBrainStore.getState();
        const selectedNode = store.selectedNode;
        
        if (!selectedNode) {
          return false;
        }
        
        const nodeRef = dreamNodeRefs.current.get(selectedNode.id);
        if (!nodeRef?.current) {
          return false;
        }
        
        // Move to center position (close to camera for large appearance)
        const centerPosition: [number, number, number] = [0, 0, -50];
        
        nodeRef.current.moveToPosition(centerPosition, 2000);
        return true;
      },
      focusOnNode: (nodeId: string) => {
        // Trigger focused layout via SpatialOrchestrator
        if (spatialOrchestratorRef.current) {
          spatialOrchestratorRef.current.focusOnNode(nodeId);
          return true;
        }
        return false;
      },
      returnToConstellation: () => {
        // Return to constellation via SpatialOrchestrator
        if (spatialOrchestratorRef.current) {
          spatialOrchestratorRef.current.returnToConstellation();
          return true;
        }
        return false;
      },
      interruptAndFocusOnNode: (nodeId: string) => {
        // Trigger focused layout with mid-flight interruption support
        if (spatialOrchestratorRef.current) {
          spatialOrchestratorRef.current.interruptAndFocusOnNode(nodeId);
          return true;
        }
        return false;
      },
      interruptAndReturnToConstellation: () => {
        // Return to constellation with mid-flight interruption support
        if (spatialOrchestratorRef.current) {
          spatialOrchestratorRef.current.interruptAndReturnToConstellation();
          return true;
        }
        return false;
      },
      applyConstellationLayout: async () => {
        // Apply constellation layout positioning via SpatialOrchestrator
        if (spatialOrchestratorRef.current) {
          await spatialOrchestratorRef.current.applyConstellationLayout();
          return;
        }
        throw new Error('SpatialOrchestrator not available');
      }
    };
  }, []);
  
  // Load dynamic nodes from service - only for mock mode
  useEffect(() => {
    const loadDynamicNodes = async () => {
      // Only load dynamic nodes in mock mode
      if (dataMode === 'mock') {
        try {
          const service = serviceManager.getActive();
          const nodes = await service.list();
          setDynamicNodes(nodes);
        } catch (error) {
          console.error('Failed to load dynamic nodes:', error);
          uiService.showError(error instanceof Error ? error.message : 'Failed to load dynamic nodes');
        }
      } else {
        // Clear dynamic nodes in real mode (using store data instead)
        setDynamicNodes([]);
      }
    };
    
    loadDynamicNodes();
  }, [dataMode]); // Re-run when data mode changes
  
  // React to spatial layout changes and trigger appropriate orchestrator methods
  useEffect(() => {
    if (!spatialOrchestratorRef.current) return;

    const store = useInterBrainStore.getState();

    switch (spatialLayout) {
      case 'search':
      case 'edit-search': {
        // Hide radial buttons when entering search mode (incompatible mode)
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);
        }

        // Both search and edit-search use the same visual architecture
        if (searchResults && searchResults.length > 0) {
          // Check if we're in edit mode - need special handling to maintain stable lists
          if (store.editMode.isActive && store.editMode.editingNode) {
            console.log(`DreamspaceCanvas: Switching to edit mode search results with ${searchResults.length} results`);
            spatialOrchestratorRef.current.showEditModeSearchResults(store.editMode.editingNode.id, searchResults);
          } else {
            console.log(`DreamspaceCanvas: Switching to search results mode with ${searchResults.length} results`);
            spatialOrchestratorRef.current.showSearchResults(searchResults);
          }
        } else if (store.searchInterface.isActive) {
          console.log('DreamspaceCanvas: Switching to search interface mode - moving all nodes to sphere surface');
          // Use liminal web architecture: move all constellation nodes to sphere surface
          // SearchNode acts like the focused node at center position [0, 0, -50]
          spatialOrchestratorRef.current.moveAllToSphereForSearch();
        }
        break;
      }

      case 'edit':
        // Hide radial buttons when entering edit mode (incompatible mode)
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);
        }

        // Edit mode - similar to liminal-web but in edit state
        if (selectedNode) {
          // Use the same focus logic as liminal-web for now
          spatialOrchestratorRef.current.focusOnNode(selectedNode.id);
        } else {
          console.warn('[Canvas-Layout] Edit mode triggered but no selectedNode available');
        }
        break;

      case 'liminal-web':
        // Trigger liminal web when a node is selected
        if (selectedNode) {
          spatialOrchestratorRef.current.focusOnNode(selectedNode.id);
        } else {
          console.warn('[Canvas-Layout] liminal-web layout triggered but no selectedNode available');
        }
        break;

      case 'copilot': {
        // Hide radial buttons when entering copilot mode (incompatible mode)
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);
        }

        // Copilot mode - conversation partner at center with search results around them
        if (store.copilotMode.isActive && store.copilotMode.conversationPartner) {
          // Position conversation partner at center (like edit mode)
          spatialOrchestratorRef.current.focusOnNode(store.copilotMode.conversationPartner.id);

          // Always call showEditModeSearchResults to trigger layout (even with empty array)
          // Empty array = all nodes fly to sphere (Option key not held behavior)
          // Non-empty array = relevant nodes in honeycomb, rest on sphere
          if (searchResults) {
            spatialOrchestratorRef.current.showEditModeSearchResults(store.copilotMode.conversationPartner.id, searchResults);
          }
        } else {
          console.warn('[Canvas-Layout] Copilot mode triggered but no active conversation partner');
        }
        break;
      }

      case 'constellation':
        // Hide radial buttons when returning to constellation (no selected node)
        if (store.radialButtonUI.isActive) {
          store.setRadialButtonUIActive(false);
        }

        // Return to constellation
        console.log('DreamspaceCanvas: Returning to constellation mode');
        spatialOrchestratorRef.current.returnToConstellation();
        break;
    }
  }, [spatialLayout, searchResults, selectedNode]); // Watch spatial layout, search results, and selected node
  
  // Listen for custom edit mode events
  useEffect(() => {
    const canvas = globalThis.document.querySelector('[data-dreamspace-canvas]');
    if (!canvas) return;
    
    const handleEditModeSaveTransition = (event: globalThis.Event) => {
      const customEvent = event as globalThis.CustomEvent;
      const nodeId = customEvent.detail?.nodeId;
      
      if (nodeId && spatialOrchestratorRef.current) {
        console.log('DreamspaceCanvas: Handling edit mode save transition for node:', nodeId);
        // Use special transition that doesn't move the center node
        spatialOrchestratorRef.current.animateToLiminalWebFromEdit(nodeId);
      }
    };
    
    const handleEditModeSearchLayout = (event: globalThis.Event) => {
      const customEvent = event as globalThis.CustomEvent;
      const centerNodeId = customEvent.detail?.centerNodeId;
      const searchResults = customEvent.detail?.searchResults;

      if (centerNodeId && searchResults && spatialOrchestratorRef.current) {
        spatialOrchestratorRef.current.showEditModeSearchResults(centerNodeId, searchResults);
      } else {
        console.error('[Canvas-Event] Missing required data - centerNode:', !!centerNodeId, 'searchResults:', !!searchResults, 'orchestrator:', !!spatialOrchestratorRef.current);
      }
    };
    
    // Handle clear edit mode data event (called when cancelling edit mode)
    const handleClearEditModeData = (_event: globalThis.Event) => {
      if (spatialOrchestratorRef.current) {
        spatialOrchestratorRef.current.clearEditModeData();
      } else {
        console.error('[Canvas-Event] Orchestrator not available for cleanup');
      }
    };

    // Handle copilot mode layout event (called when entering copilot mode)
    const handleCopilotModeLayout = (event: globalThis.Event) => {
      const customEvent = event as globalThis.CustomEvent;
      const conversationPartnerId = customEvent.detail?.conversationPartnerId;

      if (conversationPartnerId && spatialOrchestratorRef.current) {
        // Position the conversation partner at center
        spatialOrchestratorRef.current.focusOnNode(conversationPartnerId);
      } else {
        console.error('[Canvas-Event] Missing required data - conversationPartnerId:', !!conversationPartnerId, 'orchestrator:', !!spatialOrchestratorRef.current);
      }
    };
    
    canvas.addEventListener('edit-mode-save-transition', handleEditModeSaveTransition);
    canvas.addEventListener('edit-mode-search-layout', handleEditModeSearchLayout);
    canvas.addEventListener('clear-edit-mode-data', handleClearEditModeData);
    canvas.addEventListener('copilot-mode-layout', handleCopilotModeLayout);

    return () => {
      canvas.removeEventListener('edit-mode-save-transition', handleEditModeSaveTransition);
      canvas.removeEventListener('edit-mode-search-layout', handleEditModeSearchLayout);
      canvas.removeEventListener('clear-edit-mode-data', handleClearEditModeData);
      canvas.removeEventListener('copilot-mode-layout', handleCopilotModeLayout);
    };
  }, []);
  
  // Debug logging for creation state (removed excessive logging)
  
  // Callback to collect hit sphere references from DreamNode3D components
  const handleHitSphereRef = (nodeId: string, meshRef: React.RefObject<Mesh | null>) => {
    hitSphereRefs.current.set(nodeId, meshRef);
  };

  /**
   * Validate media file types for DreamTalk
   * Allows images, videos, PDFs, and .link files
   */
  const isValidMediaFile = (file: globalThis.File): boolean => {
    const validTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm',
      'application/pdf',
      // .link files appear as text/plain or application/octet-stream depending on system
      'text/plain',
      'application/octet-stream'
    ];

    // Also check file extension for .link and .pdf files since MIME detection is unreliable
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.link') || fileName.endsWith('.pdf')) {
      return true;
    }

    return validTypes.includes(file.type);
  };

  /**
   * Calculate 3D position from mouse coordinates projected onto sphere
   */
  const calculateDropPosition = (mouseX: number, mouseY: number): [number, number, number] => {
    // Get the canvas element specifically for accurate bounds
    const canvasElement = globalThis.document.querySelector('.dreamspace-canvas-container canvas') as globalThis.HTMLCanvasElement;
    if (!canvasElement) return [0, 0, -5000]; // Fallback position
    
    const rect = canvasElement.getBoundingClientRect();
    
    // Convert screen coordinates to normalized device coordinates (-1 to 1)
    // Note: Canvas coordinate system has origin at top-left, but NDC has origin at center
    const ndcX = ((mouseX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((mouseY - rect.top) / rect.height) * 2 + 1; // Flip Y for NDC
    
    
    // Create ray direction accounting for camera FOV (75 degrees)
    const fov = 75 * Math.PI / 180; // Convert to radians
    const aspect = rect.width / rect.height;
    const tanHalfFov = Math.tan(fov / 2);
    
    // Calculate proper ray direction with perspective projection
    const rayDirection = new Vector3(
      ndcX * tanHalfFov * aspect,
      ndcY * tanHalfFov,
      -1 // Forward direction from camera
    ).normalize();
    
    const raycaster = new Raycaster();
    const cameraPosition = new Vector3(0, 0, 0); // Camera is at origin
    raycaster.set(cameraPosition, rayDirection);
    
    // Find intersection with sphere
    const sphereRadius = 5000;
    const worldSphere = new Sphere(new Vector3(0, 0, 0), sphereRadius);
    
    const intersectionPoint = new Vector3();
    const hasIntersection = raycaster.ray.intersectSphere(worldSphere, intersectionPoint);
    
    if (hasIntersection && dreamWorldRef.current) {
      // Apply inverse rotation to account for sphere rotation
      const sphereRotation = dreamWorldRef.current.quaternion;
      const inverseRotation = sphereRotation.clone().invert();
      intersectionPoint.applyQuaternion(inverseRotation);
      
      
      return intersectionPoint.toArray() as [number, number, number];
    }
    
    console.warn('No intersection found with sphere - using fallback');
    // Fallback to forward position
    return [0, 0, -5000];
  };

  /**
   * Detect what's under the drop position using scene-based raycasting
   */
  const detectDropTarget = (mouseX: number, mouseY: number): { type: 'empty' | 'node'; position: [number, number, number]; node?: DreamNode } => {
    // Get the canvas element for accurate bounds
    const canvasElement = globalThis.document.querySelector('.dreamspace-canvas-container canvas') as globalThis.HTMLCanvasElement;
    if (!canvasElement) {
      return { type: 'empty', position: [0, 0, -5000] };
    }
    
    const rect = canvasElement.getBoundingClientRect();
    
    // Convert to normalized device coordinates
    const ndcX = ((mouseX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((mouseY - rect.top) / rect.height) * 2 + 1;
    
    // Create ray for intersection testing
    const fov = 75 * Math.PI / 180;
    const aspect = rect.width / rect.height;
    const tanHalfFov = Math.tan(fov / 2);
    
    const rayDirection = new Vector3(
      ndcX * tanHalfFov * aspect,
      ndcY * tanHalfFov,
      -1
    ).normalize();
    
    const raycaster = new Raycaster();
    const cameraPosition = new Vector3(0, 0, 0);
    raycaster.set(cameraPosition, rayDirection);
    
    // Collect all hit sphere meshes for raycasting
    const hitSpheres: Mesh[] = [];
    hitSphereRefs.current.forEach((meshRef, _nodeId) => {
      if (meshRef.current) {
        hitSpheres.push(meshRef.current);
      }
    });
    
    // Use Three.js native raycasting against hit sphere geometries
    const intersections = raycaster.intersectObjects(hitSpheres);
    
    // Calculate drop position on sphere
    const dropPosition = calculateDropPosition(mouseX, mouseY);
    
    if (intersections.length > 0) {
      // Get the closest intersection
      const closestIntersection = intersections[0];
      const hitMesh = closestIntersection.object as Mesh;
      const dreamNodeData = hitMesh.userData.dreamNode as DreamNode;
      
      return { type: 'node', position: dropPosition, node: dreamNodeData };
    } else {
      return { type: 'empty', position: dropPosition };
    }
  };

  const handleNodeHover = (_node: DreamNode, _isHovered: boolean) => {
    // Hover state handled by individual DreamNode3D components
  };

  // Helper function to open appropriate fullscreen content for a node
  const openNodeContent = async (node: DreamNode) => {
    const leafManager = serviceManager.getLeafManagerService();

    if (!leafManager || !vaultService || !canvasParserService) {
      console.error('Services not available for opening content');
      return;
    }

    try {
      // Check for DreamSong first (most rich content)
      const dreamSongPath = `${node.repoPath}/DreamSong.canvas`;
      if (await vaultService.fileExists(dreamSongPath)) {
        console.log(`🎭 [Copilot] Opening DreamSong for ${node.name}`);

        // Parse and open DreamSong (reuse existing pattern from fullscreen-commands.ts)
        const canvasData = await canvasParserService.parseCanvas(dreamSongPath);
        const { parseCanvasToBlocks, resolveMediaPaths } = await import('../services/dreamsong');
        let blocks = parseCanvasToBlocks(canvasData, node.id);
        blocks = await resolveMediaPaths(blocks, node.repoPath, vaultService);

        await leafManager.openDreamSongFullScreen(node, blocks);
        uiService.showSuccess(`Opened DreamSong for ${node.name}`);
        return;
      }

      // Check for DreamTalk media
      if (node.dreamTalkMedia && node.dreamTalkMedia.length > 0) {
        console.log(`🎤 [Copilot] Opening DreamTalk for ${node.name}`);
        await leafManager.openDreamTalkFullScreen(node, node.dreamTalkMedia[0]);
        uiService.showSuccess(`Opened DreamTalk for ${node.name}`);
        return;
      }

      // Try README as final fallback
      const readmePath = `${node.repoPath}/README.md`;
      if (await vaultService.fileExists(readmePath)) {
        console.log(`📖 [Copilot] Opening README for ${node.name}`);
        await leafManager.openReadmeFile(node);
        uiService.showSuccess(`Opened README for ${node.name}`);
        return;
      }

      // Nothing to display
      console.log(`❌ [Copilot] No content found for ${node.name}`);
      uiService.showInfo("Nothing to display");

    } catch (error) {
      console.error(`Failed to open content for ${node.name}:`, error);
      uiService.showError(`Failed to open content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleNodeClick = async (node: DreamNode) => {
    const store = useInterBrainStore.getState();

    // Handle copilot mode invoke interaction
    if (store.spatialLayout === 'copilot' && store.copilotMode.isActive) {
      // IMPORTANT: Prevent clicking the conversation partner itself
      if (store.copilotMode.conversationPartner?.id === node.id) {
        console.log(`❌ [Copilot] Cannot invoke conversation partner node: ${node.name}`);
        return; // Do nothing when clicking the conversation partner
      }

      console.log(`🤖 [Copilot] Invoking node via CLICK: ${node.name}`);

      // CRITICAL: Record invocation for conversation export
      try {
        const { getConversationRecordingService } = await import('../features/conversational-copilot/services/conversation-recording-service');
        const recordingService = getConversationRecordingService();
        console.log(`🎙️ [Copilot-Click] About to record invocation for: ${node.name}`);
        await recordingService.recordInvocation(node);
        console.log(`✅ [Copilot-Click] Invocation recorded successfully`);
      } catch (error) {
        console.error('❌ [Copilot-Click] Failed to record invocation:', error);
        // Don't block the click flow if recording fails
      }

      // Track this node as shared
      store.addSharedNode(node.id);
      console.log(`🔗 [Copilot] Added shared node: ${node.name} (${node.id})`);

      // Get updated state to log current shared nodes
      const updatedStore = useInterBrainStore.getState();
      console.log(`🔗 [Copilot] Total shared nodes: ${updatedStore.copilotMode.sharedNodeIds.length}`);
      console.log(`🔗 [Copilot] Shared node IDs:`, updatedStore.copilotMode.sharedNodeIds);

      // Open appropriate fullscreen view
      await openNodeContent(node);

      return; // Prevent liminal-web navigation
    }

    // Handle edit mode relationship toggling
    if (store.editMode.isActive && store.editMode.editingNode) {
      // In edit mode, clicking a node toggles its relationship status
      store.togglePendingRelationship(node.id);
      console.log(`Edit mode: Toggled relationship with "${node.name}"`);

      // Trigger immediate reordering for priority-based positioning
      if (spatialOrchestratorRef.current) {
        spatialOrchestratorRef.current.reorderEditModeSearchResults();
      }

      return; // Don't do normal click handling in edit mode
    }
    
    // Normal click handling (not in edit mode)
    
    // If we're in search mode, properly exit search interface when clicking a result
    if (store.spatialLayout === 'search' && store.searchInterface.isActive) {
      console.log('Clicking search result - exiting search mode cleanly');
      store.setSearchActive(false); // This clears search query and results
    }
    
    store.setSelectedNode(node);
    // Trigger focused layout via SpatialOrchestrator
    if (spatialOrchestratorRef.current) {
      spatialOrchestratorRef.current.focusOnNode(node.id);
    }
  };

  const handleNodeDoubleClick = (_node: DreamNode) => {
    // TODO: Open DreamSong view
  };

  const handleProtoNodeComplete = async (protoNode: ProtoNode) => {
    try {
      
      // Use raycasting to find intersection with rotated sphere (more robust approach)
      let finalPosition = protoNode.position;
      if (dreamWorldRef.current) {
        // Create raycaster from camera position forward
        const raycaster = new Raycaster();
        const cameraPosition = new Vector3(0, 0, 0); // Camera is at origin
        const cameraDirection = new Vector3(0, 0, -1); // Forward direction
        
        raycaster.set(cameraPosition, cameraDirection);
        
        // Create sphere geometry in world space (accounting for rotation)
        const sphereRadius = 5000;
        const worldSphere = new Sphere(new Vector3(0, 0, 0), sphereRadius);
        
        // Find intersection points
        const intersectionPoint = new Vector3();
        const hasIntersection = raycaster.ray.intersectSphere(worldSphere, intersectionPoint);
        
        if (hasIntersection) {
          // Since the sphere rotates but the camera ray is fixed, we need to apply
          // the INVERSE rotation to get the correct position on the rotated sphere
          const sphereRotation = dreamWorldRef.current.quaternion;
          const inverseRotation = sphereRotation.clone().invert();
          intersectionPoint.applyQuaternion(inverseRotation);
          
          finalPosition = intersectionPoint.toArray() as [number, number, number];
          
        } else {
          console.warn('No intersection found with sphere - using default position');
          finalPosition = [0, 0, -5000]; // Fallback to forward position
        }
      }
      
      // Use the service manager to create the node
      const service = serviceManager.getActive();
      await service.create(
        protoNode.title,
        protoNode.type,
        protoNode.dreamTalkFile,
        finalPosition, // Pass rotation-adjusted position to project onto sphere
        protoNode.additionalFiles // Pass additional files from proto-node
      );
      
      // No need to manually refresh - event listener will handle it
      
      // Add small delay to ensure new DreamNode renders before hiding proto-node
      globalThis.setTimeout(() => {
        completeCreation();
      }, 100); // 100ms delay for rendering
      
    } catch (error) {
      console.error('Failed to create DreamNode:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to create DreamNode');
    }
  };

  const handleProtoNodeCancel = () => {
    cancelCreation();
  };

  // Search interface handlers
  const handleSearchSave = async (query: string, dreamTalkFile?: globalThis.File, additionalFiles?: globalThis.File[]) => {
    try {
      console.log('SearchNode save:', { query, dreamTalkFile, additionalFiles });
      
      // Use raycasting to find intersection with rotated sphere (same as ProtoNode)
      let finalPosition: [number, number, number] = [0, 0, -50]; // Fallback position
      if (dreamWorldRef.current) {
        // Create raycaster from camera position forward
        const raycaster = new Raycaster();
        const cameraPosition = new Vector3(0, 0, 0); // Camera is at origin
        const cameraDirection = new Vector3(0, 0, -1); // Forward direction
        
        raycaster.set(cameraPosition, cameraDirection);
        
        // Create sphere geometry in world space (accounting for rotation)
        const sphereRadius = 5000;
        const worldSphere = new Sphere(new Vector3(0, 0, 0), sphereRadius);
        
        // Find intersection points
        const intersectionPoint = new Vector3();
        const hasIntersection = raycaster.ray.intersectSphere(worldSphere, intersectionPoint);
        
        if (hasIntersection) {
          // Since the sphere rotates but the camera ray is fixed, we need to apply
          // the INVERSE rotation to get the correct position on the rotated sphere
          const sphereRotation = dreamWorldRef.current.quaternion;
          const inverseRotation = sphereRotation.clone().invert();
          intersectionPoint.applyQuaternion(inverseRotation);
          
          finalPosition = intersectionPoint.toArray() as [number, number, number];
          
        } else {
          console.warn('No intersection found with sphere - using default position');
          finalPosition = [0, 0, -5000]; // Fallback to forward position
        }
      }
      
      // Use service to create DreamNode from search query
      const service = serviceManager.getActive();
      await service.create(
        query,
        'dream',
        dreamTalkFile, // DreamTalk file (single file)
        finalPosition, // Pass rotation-adjusted position to project onto sphere
        additionalFiles // Additional files array
      );
      
      // No need to manually refresh - event listener will handle it
      
      // Note: Constellation return is already triggered by SearchNode3D handleSave()
      // which happens BEFORE this onSave callback, ensuring parallel animations
      
      // Delay dismissing search interface to ensure overlap and prevent flicker
      // This runs AFTER the save animation (1000ms) and overlap period (100ms)
      globalThis.setTimeout(() => {
        // Dismiss search interface after everything is rendered
        const store = useInterBrainStore.getState();
        store.setSearchActive(false);
        
        // Show success message
        uiService.showSuccess(`Created DreamNode: "${query}"`);
      }, 200); // Increased delay to ensure DreamNode is fully rendered
      
    } catch (error) {
      console.error('Failed to create DreamNode from search:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to create DreamNode');
    }
  };

  const handleSearchCancel = () => {
    const store = useInterBrainStore.getState();
    store.setSearchActive(false);
    store.setSpatialLayout('constellation');
  };

  const handleSearchResults = (results: { node: DreamNode; score: number }[]) => {
    // Convert search results to DreamNodes for spatial display
    const searchResultNodes = results.map(result => result.node);
    
    // Update store with search results
    const store = useInterBrainStore.getState();
    store.setSearchResults(searchResultNodes);
    
    // If we have results and no search interface active, switch to search results display
    if (searchResultNodes.length > 0 && !store.searchInterface.isActive) {
      if (spatialOrchestratorRef.current) {
        spatialOrchestratorRef.current.showSearchResults(searchResultNodes);
      }
    }
    
    console.log(`DreamspaceCanvas: Updated with ${searchResultNodes.length} search results`);
  };

  const handleDropOnNode = async (files: globalThis.File[], node: DreamNode) => {
    try {
      const service = serviceManager.getActive();

      // In regular mode (not edit mode), just add files without updating dreamTalk
      // This treats file drops like dropping files on a folder
      if (service.addFilesToNodeWithoutDreamTalkUpdate) {
        await service.addFilesToNodeWithoutDreamTalkUpdate(node.id, files);
        uiService.showSuccess(`Added ${files.length} file(s) to "${node.name}"`);
      } else {
        // Fallback for services that don't support the new method
        await service.addFilesToNode(node.id, files);
      }

      // No need to manually refresh - event listener will handle it
    } catch (error) {
      console.error('Failed to add files to node:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to add files to node');
    }
  };

  // Drag and drop event handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Track mouse position for drop positioning
    setDragMousePosition({ x: e.clientX, y: e.clientY });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only clear drag state if leaving the container (not just moving between children)
    if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node)) {
      setIsDragOver(false);
      setDragMousePosition(null);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragOver(false);

    // Check for files first
    const files = Array.from(e.dataTransfer.files);

    // Check for text/URL data if no files
    let urlData: string | null = null;
    if (files.length === 0) {
      // Try different data formats for URLs
      urlData = e.dataTransfer.getData('text/uri-list') ||
                e.dataTransfer.getData('text/plain') ||
                e.dataTransfer.getData('text/html') ||
                null;
    }

    // Must have either files or URL data
    if (files.length === 0 && !urlData) return;

    const mousePos = dragMousePosition || { x: e.clientX, y: e.clientY };
    const dropTarget = detectDropTarget(mousePos.x, mousePos.y);
    const isCommandDrop = e.metaKey || e.ctrlKey; // Command on Mac, Ctrl on Windows/Linux

    // Handle URL drops
    if (urlData && files.length === 0) {
      console.log('🔗 URL drop detected:', { urlData, isCommandDrop });

      if (dropTarget.type === 'node' && dropTarget.node) {
        // Dropping URL on an existing DreamNode
        await handleUrlDropOnNode(urlData, dropTarget.node);
      } else {
        // Dropping URL on empty space
        if (isCommandDrop) {
          // Command+Drop: Open ProtoNode3D with URL pre-filled
          await handleCommandUrlDrop(urlData);
        } else {
          // Normal Drop: Create node instantly at drop position
          await handleNormalUrlDrop(urlData, dropTarget.position);
        }
      }
      setDragMousePosition(null);
      return;
    }

    // Handle file drops (existing logic)
    if (dropTarget.type === 'node' && dropTarget.node) {
      // Dropping on an existing DreamNode
      if (isCommandDrop) {
        // Command+Drop on node: TODO - could open edit mode in future
        await handleDropOnNode(files, dropTarget.node);
      } else {
        // Normal drop on node: add files to node
        await handleDropOnNode(files, dropTarget.node);
      }
    } else {
      // Dropping on empty space
      if (isCommandDrop) {
        // Command+Drop: Open ProtoNode3D with file pre-filled
        await handleCommandDrop(files);
      } else {
        // Normal Drop: Create node instantly at drop position
        await handleNormalDrop(files, dropTarget.position);
      }
    }

    setDragMousePosition(null);
  };

  const handleNormalDrop = async (files: globalThis.File[], position: [number, number, number]) => {
    try {
      const primaryFile = files[0]; // Use first file for node naming and primary dreamTalk
      const fileNameWithoutExt = primaryFile.name.replace(/\.[^/.]+$/, ''); // Remove extension

      // Convert PascalCase file names to human-readable titles with spaces
      // Example: "HawkinsScale" → "Hawkins Scale"
      const { isPascalCase, pascalCaseToTitle } = await import('../utils/title-sanitization');
      const humanReadableTitle = isPascalCase(fileNameWithoutExt)
        ? pascalCaseToTitle(fileNameWithoutExt)
        : fileNameWithoutExt;

      const store = useInterBrainStore.getState();
      const service = serviceManager.getActive();
      
      // Find first valid media file for dreamTalk
      const dreamTalkFile = files.find(f => isValidMediaFile(f));
      const additionalFiles = files.filter(f => f !== dreamTalkFile);
      
      // Determine node type based on liminal-web context
      let nodeType: 'dream' | 'dreamer' = 'dream'; // Default to Dream
      let shouldAutoRelate = false;
      let focusedNodeId: string | null = null;
      
      // In liminal-web mode with a focused node, create opposite type and auto-relate
      if (store.spatialLayout === 'liminal-web' && store.selectedNode) {
        const focusedNode = store.selectedNode;
        focusedNodeId = focusedNode.id;
        
        // Create opposite type for automatic relationship
        nodeType = focusedNode.type === 'dream' ? 'dreamer' : 'dream';
        shouldAutoRelate = true;
        
        console.log(`Liminal-web drop: Creating ${nodeType} to relate with ${focusedNode.type} "${focusedNode.name}"`);
      }
      
      // Create node with determined type
      const newNode = await service.create(
        humanReadableTitle,
        nodeType,
        dreamTalkFile,
        position,
        additionalFiles
      );
      
      // Auto-create relationship if in liminal-web mode
      if (shouldAutoRelate && focusedNodeId && newNode) {
        try {
          // Add bidirectional relationship
          await service.addRelationship(focusedNodeId, newNode.id);
          console.log(`Auto-related new ${nodeType} "${newNode.name}" with focused node`);
          uiService.showSuccess(`Created ${nodeType} "${newNode.name}" and related to focused node`);
          
          // Refresh the focused node to include the new relationship
          const updatedFocusedNode = await service.get(focusedNodeId);
          if (updatedFocusedNode) {
            // Update the selected node with fresh relationship data
            store.setSelectedNode(updatedFocusedNode);
            
            // Trigger a liminal-web layout refresh with smooth fly-in for the new node
            // Small delay to ensure the new node is in the store
            globalThis.setTimeout(() => {
              if (spatialOrchestratorRef.current) {
                spatialOrchestratorRef.current.focusOnNodeWithFlyIn(focusedNodeId, newNode.id);
              }
            }, 100);
          }
        } catch (error) {
          console.error('Failed to create automatic relationship:', error);
          // Don't fail the whole operation if relationship fails
        }
      }
      
    } catch (error) {
      console.error('Failed to create node from drop:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to create node from drop');
    }
  };

  const handleCommandDrop = async (files: globalThis.File[]) => {
    try {
      const file = files[0]; // Use first file for title
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, ''); // Remove extension

      // Convert PascalCase file names to human-readable titles with spaces
      // Example: "HawkinsScale" → "Hawkins Scale"
      const { isPascalCase, pascalCaseToTitle } = await import('../utils/title-sanitization');
      const humanReadableTitle = isPascalCase(fileNameWithoutExt)
        ? pascalCaseToTitle(fileNameWithoutExt)
        : fileNameWithoutExt;

      // Use the EXACT same position as the Create DreamNode command
      const spawnPosition: [number, number, number] = [0, 0, -25];

      // Separate media files from other files
      const mediaFiles = files.filter(f => isValidMediaFile(f));
      const otherFiles = files.filter(f => !isValidMediaFile(f));

      // Use first media file as dreamTalk, rest go to additional files
      const dreamTalkFile = mediaFiles.length > 0 ? mediaFiles[0] : undefined;
      const additionalFiles = [
        ...mediaFiles.slice(1), // Remaining media files
        ...otherFiles // All non-media files (like PDFs)
      ];

      // Start creation with pre-filled data including all files
      startCreationWithData(spawnPosition, {
        title: humanReadableTitle,
        type: 'dream',
        dreamTalkFile: dreamTalkFile,
        additionalFiles: additionalFiles.length > 0 ? additionalFiles : undefined
      });


    } catch (error) {
      console.error('Failed to start creation from drop:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to start creation from drop');
    }
  };

  const handleNormalUrlDrop = async (urlData: string, position: [number, number, number]) => {
    try {
      const urlMetadata = await processDroppedUrlData(urlData);

      if (!urlMetadata || !urlMetadata.isValid) {
        uiService.showError('Invalid URL dropped');
        return;
      }

      console.log('🔗 Creating DreamNode from URL:', urlMetadata);

      const store = useInterBrainStore.getState();
      const service = serviceManager.getActive();

      // Determine node type based on liminal-web context (same as file drop logic)
      let nodeType: 'dream' | 'dreamer' = 'dream';
      let shouldAutoRelate = false;
      let focusedNodeId: string | null = null;

      if (store.spatialLayout === 'liminal-web' && store.selectedNode) {
        const focusedNode = store.selectedNode;
        focusedNodeId = focusedNode.id;
        nodeType = focusedNode.type === 'dream' ? 'dreamer' : 'dream';
        shouldAutoRelate = true;
        console.log(`Liminal-web URL drop: Creating ${nodeType} to relate with ${focusedNode.type} "${focusedNode.name}"`);
      }

      // Create the DreamNode with URL as the "dreamTalk" (stored in metadata)
      // For website URLs, use AI-powered analysis if enabled and set up in settings
      let newNode: DreamNode;
      const webLinkAnalyzerReady = serviceManager.isWebLinkAnalyzerReady();
      console.log(`🔗 URL type: ${urlMetadata.type}, has createFromWebsiteUrl: ${!!service.createFromWebsiteUrl}, analyzer ready: ${webLinkAnalyzerReady}`);

      if (urlMetadata.type === 'website' && service.createFromWebsiteUrl && webLinkAnalyzerReady) {
        const apiKey = serviceManager.getClaudeApiKey();
        console.log(`🔗 Using AI analysis, API key configured: ${!!apiKey}`);
        newNode = await service.createFromWebsiteUrl(
          urlMetadata.title || urlMetadata.url,
          nodeType,
          urlMetadata,
          position,
          apiKey || undefined
        );
      } else {
        // Fallback: create basic node without AI analysis
        if (urlMetadata.type === 'website' && !webLinkAnalyzerReady) {
          console.log(`🔗 Web Link Analyzer not ready, using basic node creation`);
        }
        newNode = await service.createFromUrl(
          urlMetadata.title || urlMetadata.url,
          nodeType,
          urlMetadata,
          position
        );
      }

      // Auto-create relationship if in liminal-web mode
      if (shouldAutoRelate && focusedNodeId && newNode) {
        try {
          await service.addRelationship(focusedNodeId, newNode.id);
          console.log(`Auto-related new ${nodeType} "${newNode.name}" with focused node`);
          uiService.showSuccess(`Created ${nodeType} "${newNode.name}" and related to focused node`);

          // Refresh and trigger layout update (same as file drop)
          const updatedFocusedNode = await service.get(focusedNodeId);
          if (updatedFocusedNode) {
            store.setSelectedNode(updatedFocusedNode);
            globalThis.setTimeout(() => {
              if (spatialOrchestratorRef.current) {
                spatialOrchestratorRef.current.focusOnNodeWithFlyIn(focusedNodeId, newNode.id);
              }
            }, 100);
          }
        } catch (error) {
          console.error('Failed to create automatic relationship:', error);
        }
      }

    } catch (error) {
      console.error('Failed to create node from URL drop:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to create node from URL drop');
    }
  };

  const handleCommandUrlDrop = async (urlData: string) => {
    try {
      const urlMetadata = await processDroppedUrlData(urlData);

      if (!urlMetadata || !urlMetadata.isValid) {
        uiService.showError('Invalid URL dropped');
        return;
      }

      console.log('🔗 Opening ProtoNode with URL:', urlMetadata);

      // Use the same spawn position as file command drop
      const spawnPosition: [number, number, number] = [0, 0, -25];

      // Start creation with URL pre-filled in ProtoNode
      startCreationWithData(spawnPosition, {
        title: urlMetadata.title || urlMetadata.url,
        type: 'dream',
        urlMetadata: urlMetadata // Add URL metadata to proto node data
      });

    } catch (error) {
      console.error('Failed to start creation from URL drop:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to start creation from URL drop');
    }
  };

  const handleUrlDropOnNode = async (urlData: string, node: DreamNode) => {
    try {
      const urlMetadata = await processDroppedUrlData(urlData);

      if (!urlMetadata || !urlMetadata.isValid) {
        uiService.showError('Invalid URL dropped');
        return;
      }

      console.log('🔗 Adding URL to existing DreamNode:', { url: urlMetadata, node: node.name });

      // Use service to add URL to existing node
      const service = serviceManager.getActive();
      await service.addUrlToNode(node.id, urlMetadata);

      uiService.showSuccess(`Added URL to "${node.name}"`);

    } catch (error) {
      console.error('Failed to add URL to node:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to add URL to node');
    }
  };

  const prevRenderCountRef = useRef(0);

  return (
    <div
      className="dreamspace-canvas-container"
      data-dreamspace-canvas
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{
          position: [0, 0, 0],  // Static camera at origin
          fov: 75,
          near: 0.1,
          far: 20000  // Increased for better visibility of intersection point
        }}
        gl={{ antialias: true }}
        style={{
          width: '100%',
          height: '100%',
          background: '#000000'
        }}
        onPointerMissed={() => {
          // Clicked on empty space - handle based on current spatial layout
          const store = useInterBrainStore.getState();
          
          // Suppress empty space clicks during edit mode
          if (store.editMode.isActive) {
            console.log('Empty space clicked during edit mode - ignoring');
            return;
          }

          // Suppress empty space clicks during copilot mode to prevent accidental navigation
          if (store.copilotMode.isActive) {
            console.log('Empty space clicked during copilot mode - ignoring to prevent accidental constellation return');
            return;
          }

          // Suppress empty space clicks when option key is held (radial button mode)
          if (store.radialButtonUI.optionKeyPressed) {
            return;
          }

          if (store.spatialLayout === 'search') {
            if (store.searchInterface.isActive) {
              // Dismiss search interface and return to constellation
              console.log('Empty space clicked in search interface - dismissing search');
              store.setSearchActive(false);
              store.setSpatialLayout('constellation');
            } else {
              // Clear search results and return to constellation
              console.log('Empty space clicked in search results mode - clearing search');
              store.setSearchResults([]);
              store.setSpatialLayout('constellation');
            }
          } else if (store.spatialLayout === 'liminal-web') {
            // Deselect and return to constellation
            console.log('Empty space clicked in liminal web - deselecting node');
            store.setSelectedNode(null);
            store.setSpatialLayout('constellation');
          } else {
            // Already in constellation mode, just log
            console.log('Empty space clicked in constellation mode');
          }
        }}
      >
        {/* Camera reset handler - listens for store changes and resets camera */}
        <CameraResetHandler />
        
        {/* Debug intersection point - STATIONARY relative to camera (outside rotatable group) */}
        {debugIntersectionPoint && (
          <mesh position={[CAMERA_INTERSECTION_POINT.x, CAMERA_INTERSECTION_POINT.y, CAMERA_INTERSECTION_POINT.z]}>
            <sphereGeometry args={[60, 16, 16]} />
            <meshBasicMaterial color="#ff0000" />
          </mesh>
        )}

        {/* Radial button UI - STATIONARY relative to camera (outside rotatable group) */}
        {shouldMountRadialButtons && selectedNode && spatialLayout === 'liminal-web' && (
          <RadialButtonRing3D
            centerNodePosition={[0, 0, -50]}
            isActive={radialButtonUI.isActive}
            onExitComplete={() => {
              setShouldMountRadialButtons(false);
            }}
          />
        )}

        {/* Active video call button - visible during copilot mode (outside rotatable group) */}
        {copilotMode.isActive && copilotMode.conversationPartner && (
          <ActiveVideoCallButton />
        )}

        {/* Rotatable group containing all DreamNodes */}
        <group ref={dreamWorldRef}>
          {/* Debug wireframe sphere - toggleable via Obsidian commands */}
          {debugWireframeSphere && (
            <mesh>
              <sphereGeometry args={[5000, 32, 32]} />
              <meshBasicMaterial color="#00ff00" wireframe={true} transparent={true} opacity={0.3} />
            </mesh>
          )}
          
          {/* OPTIMIZATION: Dynamic scaling only needed in constellation view */}
          {(() => {
            const shouldEnableDynamicScaling = spatialLayout === 'constellation';

            // DIAGNOSTIC: Only log when node count changes significantly
            if (Math.abs(dreamNodes.length - prevRenderCountRef.current) > 2) {
              console.log(`[DreamNodeRendering] 🎨 Rendering ${dreamNodes.length} nodes`);
              prevRenderCountRef.current = dreamNodes.length;
            }

            const renderedNodes = dreamNodes.map((node) => (
              <React.Fragment key={node.id}>
                {/* Star component - purely visual, positioned slightly closer than anchor */}
                <Star3D
                  position={node.position}
                  size={5000}
                />
                
                {/* DreamNode component - handles all interactions and dynamic positioning */}
                <DreamNode3D
                  ref={getDreamNodeRef(node.id)}
                  dreamNode={node}
                  onHover={handleNodeHover}
                  onClick={handleNodeClick}
                  onDoubleClick={handleNodeDoubleClick}
                  enableDynamicScaling={shouldEnableDynamicScaling}
                  onHitSphereRef={handleHitSphereRef}
                  vaultService={vaultService}
                  canvasParserService={canvasParserService}
                />
              </React.Fragment>
            ));

            return renderedNodes;
          })()}

          {/* Constellation edges - render DreamSong relationship threads */}
          {shouldShowConstellationEdges(spatialLayout) && (
            <ConstellationEdges
              dreamNodes={dreamNodes}
              dreamWorldRef={dreamWorldRef}
              showEdges={true}
              opacity={0.6}
            />
          )}
        </group>

        {/* SpatialOrchestrator - manages all spatial interactions and layouts */}
        <SpatialOrchestrator
          ref={spatialOrchestratorRef}
          dreamNodes={dreamNodes}
          dreamWorldRef={dreamWorldRef}
          onNodeFocused={(_nodeId) => {
            // Node focused by orchestrator
          }}
          onConstellationReturn={() => {
            console.log('DreamspaceCanvas: Returned to constellation by orchestrator');
          }}
          onOrchestratorReady={() => {
            // Register all existing refs when orchestrator is ready
            dreamNodeRefs.current.forEach((nodeRef, nodeId) => {
              if (nodeRef && spatialOrchestratorRef.current) {
                spatialOrchestratorRef.current.registerNodeRef(nodeId, nodeRef as React.RefObject<DreamNode3DRef>);
              }
            });
          }}
          transitionDuration={1000}
        />
        
        {/* Proto-node for creation - stationary relative to camera */}
        {creationState.isCreating && creationState.protoNode && (
          <>
            <ProtoNode3D
              position={creationState.protoNode.position}
              onComplete={handleProtoNodeComplete}
              onCancel={handleProtoNodeCancel}
            />
          </>
        )}
        
        {/* Search node interface - render if in search mode OR during save animation */}
        {((searchInterface.isActive && spatialLayout === 'search') || searchInterface.isSaving) && (
          <>
            <SearchNode3D
              position={[0, 0, -50]} // Focus position
              onSave={handleSearchSave}
              onCancel={handleSearchCancel}
            />
            <SearchOrchestrator
              onSearchResults={handleSearchResults}
            />
          </>
        )}
        
        {/* Edit mode overlay - render when edit mode is active */}
        <EditModeOverlay />

        {/* Copilot mode overlay - render when copilot mode is active */}
        <CopilotModeOverlay />

        {/* Flying camera controls for debugging - toggleable */}
        {debugFlyingControls && (
          <FlyControls
            movementSpeed={1000}
            rollSpeed={Math.PI / 6}
            autoForward={false}
            dragToLook={true}
          />
        )}
        
        {/* Mouse drag controls for rotating the sphere - only when flying controls are off */}
        {!debugFlyingControls && <SphereRotationControls groupRef={dreamWorldRef} />}
        
        {/* Ambient lighting for any 3D elements (minimal) */}
        <ambientLight intensity={0.1} />
      </Canvas>
    </div>
  );
}

/**
 * Camera reset handler component that listens for store changes and resets the Three.js camera
 */
function CameraResetHandler() {
  const { camera } = useThree();
  const cameraPosition = useInterBrainStore(state => state.camera.position);
  const cameraTarget = useInterBrainStore(state => state.camera.target);

  useEffect(() => {
    // Reset camera position when store values change
    camera.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
    camera.lookAt(cameraTarget[0], cameraTarget[1], cameraTarget[2]);
    camera.updateProjectionMatrix();
  }, [camera, cameraPosition, cameraTarget]);

  return null; // This component doesn't render anything
}

