import React, { useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import { Group, Vector3, Raycaster, Sphere, Mesh } from 'three';
import { FlyControls } from '@react-three/drei';
import { getMockDataForConfig } from '../mock/dreamnode-mock-data';
import DreamNode3D, { DreamNode3DRef } from './DreamNode3D';
import Star3D from './Star3D';
import SphereRotationControls from './SphereRotationControls';
import SpatialOrchestrator, { SpatialOrchestratorRef } from './SpatialOrchestrator';
import ProtoNode3D from '../features/creation/ProtoNode3D';
import SearchNode3D from '../features/search/SearchNode3D';
import SearchOrchestrator from '../features/search/SearchOrchestrator';
import { EditModeOverlay } from '../features/edit-mode';
import { DreamNode } from '../types/dreamnode';
import { useInterBrainStore, ProtoNode } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';
import { UIService } from '../services/ui-service';
import { CAMERA_INTERSECTION_POINT } from './DynamicViewScaling';

// Create a singleton UI service instance
const uiService = new UIService();

export default function DreamspaceCanvas() {
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

  // Global escape key handler for all layout modes
  useEffect(() => {
    const handleGlobalEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      const store = useInterBrainStore.getState();
      
      // Priority 1: Edit mode search (highest priority) - DON'T HANDLE, let component do it
      if (store.editMode.isActive && store.editMode.isSearchingRelationships) {
        console.log(`🌐 [DreamspaceCanvas] Global escape: In edit search mode - letting component handle`);
        return; // Let EditModeSearchNode3D handle it completely
      }
      
      // Priority 2: Edit mode (second priority)  
      if (store.editMode.isActive && !store.editMode.isSearchingRelationships) {
        console.log(`✏️ [DreamspaceCanvas] Global escape: Exiting edit mode to liminal-web`);
        console.log(`✏️ [DreamspaceCanvas] Pre-exit state: selectedNode=${store.selectedNode?.name}, spatialLayout=${store.spatialLayout}`);
        e.preventDefault();
        e.stopImmediatePropagation(); // Prevent any other handlers from running
        
        const selectedNode = store.selectedNode; // Capture before exitEditMode
        store.exitEditMode();
        
        // Always set to liminal-web if there was a selected node
        if (selectedNode) {
          console.log(`✏️ [DreamspaceCanvas] Setting layout to liminal-web for node: ${selectedNode.name}`);
          store.setSpatialLayout('liminal-web');
        } else {
          console.log(`✏️ [DreamspaceCanvas] No selected node, going to constellation`);
          store.setSpatialLayout('constellation');
        }
        return;
      }
      
      // Priority 3: Global search mode
      if (store.spatialLayout === 'search') {
        console.log(`🔍 [DreamspaceCanvas] Global escape: Exiting search mode to constellation`);
        e.preventDefault();
        store.setSearchResults([]);
        store.setSpatialLayout('constellation');
        return;
      }
      
      // Priority 4: Liminal web mode  
      if (store.spatialLayout === 'liminal-web') {
        console.log(`🕸️ [DreamspaceCanvas] Global escape: Exiting liminal-web to constellation`);
        e.preventDefault();
        store.setSelectedNode(null);
        store.setSpatialLayout('constellation');
        return;
      }
      
      console.log(`🌌 [DreamspaceCanvas] Global escape: Already in constellation mode or unhandled state`);
    };

    console.log(`🎯 [DreamspaceCanvas] Setting up global escape handler`);
    globalThis.document.addEventListener('keydown', handleGlobalEscape);
    
    return () => {
      console.log(`🧹 [DreamspaceCanvas] Removing global escape handler`);
      globalThis.document.removeEventListener('keydown', handleGlobalEscape);
    };
  }, []); // Empty deps - only setup once
  
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
    // Use real nodes from store
    dreamNodes = Array.from(realNodes.values()).map(data => data.node);
  }
  
  // Reference to the group containing all DreamNodes for rotation
  const dreamWorldRef = useRef<Group>(null);
  
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
  
  // Search interface state
  const searchInterface = useInterBrainStore(state => state.searchInterface);
  
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
    
    switch (spatialLayout) {
      case 'search': {
        // Search mode handles both search interface and search results display
        const store = useInterBrainStore.getState();
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
        
      case 'liminal-web':
        // Trigger liminal web when a node is selected
        if (selectedNode) {
          console.log(`🌐 [Canvas-Layout] Switching to liminal-web for node "${selectedNode.name}" (${selectedNode.id}) with ${selectedNode.liminalWebConnections?.length || 0} relationships`);
          spatialOrchestratorRef.current.focusOnNode(selectedNode.id);
        } else {
          console.warn(`⚠️ [Canvas-Layout] liminal-web layout triggered but no selectedNode available`);
        }
        break;
        
      case 'constellation':
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
      
      console.log(`🎪 [Canvas-Event] Received edit-mode-search-layout event for center ${centerNodeId} with ${searchResults?.length || 0} related nodes`);
      
      if (centerNodeId && searchResults && spatialOrchestratorRef.current) {
        console.log(`🎯 [Canvas-Event] Calling orchestrator.showEditModeSearchResults()`);
        spatialOrchestratorRef.current.showEditModeSearchResults(centerNodeId, searchResults);
      } else {
        console.error(`❌ [Canvas-Event] Missing required data - centerNode: ${!!centerNodeId}, searchResults: ${!!searchResults}, orchestrator: ${!!spatialOrchestratorRef.current}`);
      }
    };
    
    // Handle clear edit mode data event (called when cancelling edit mode)
    const handleClearEditModeData = (event: globalThis.Event) => {
      const customEvent = event as globalThis.CustomEvent;
      const source = customEvent.detail?.source;
      
      console.log(`🧹 [Canvas-Event] Received clear-edit-mode-data event from ${source}`);
      
      if (spatialOrchestratorRef.current) {
        spatialOrchestratorRef.current.clearEditModeData();
      } else {
        console.error(`❌ [Canvas-Event] Orchestrator not available for cleanup`);
      }
    };
    
    canvas.addEventListener('edit-mode-save-transition', handleEditModeSaveTransition);
    canvas.addEventListener('edit-mode-search-layout', handleEditModeSearchLayout);
    canvas.addEventListener('clear-edit-mode-data', handleClearEditModeData);
    
    return () => {
      canvas.removeEventListener('edit-mode-save-transition', handleEditModeSaveTransition);
      canvas.removeEventListener('edit-mode-search-layout', handleEditModeSearchLayout);
      canvas.removeEventListener('clear-edit-mode-data', handleClearEditModeData);
    };
  }, []);
  
  // Debug logging for creation state (removed excessive logging)
  
  // Callback to collect hit sphere references from DreamNode3D components
  const handleHitSphereRef = (nodeId: string, meshRef: React.RefObject<Mesh | null>) => {
    hitSphereRefs.current.set(nodeId, meshRef);
  };

  /**
   * Validate media file types for DreamTalk
   */
  const isValidMediaFile = (file: globalThis.File): boolean => {
    const validTypes = [
      'image/png',
      'image/jpeg', 
      'image/jpg',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/webm'
    ];
    
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

  const handleNodeClick = (node: DreamNode) => {
    const store = useInterBrainStore.getState();
    
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
      
      // Use service to add files to existing node
      const service = serviceManager.getActive();
      await service.addFilesToNode(node.id, files);
      
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
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    
    const mousePos = dragMousePosition || { x: e.clientX, y: e.clientY };
    const dropTarget = detectDropTarget(mousePos.x, mousePos.y);
    const isCommandDrop = e.metaKey || e.ctrlKey; // Command on Mac, Ctrl on Windows/Linux
    
    
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
        fileNameWithoutExt,
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
        title: fileNameWithoutExt,
        type: 'dream',
        dreamTalkFile: dreamTalkFile,
        additionalFiles: additionalFiles.length > 0 ? additionalFiles : undefined
      });
      
      
    } catch (error) {
      console.error('Failed to start creation from drop:', error);
      uiService.showError(error instanceof Error ? error.message : 'Failed to start creation from drop');
    }
  };

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

        {/* Rotatable group containing all DreamNodes */}
        <group ref={dreamWorldRef}>
          {/* Debug wireframe sphere - toggleable via Obsidian commands */}
          {debugWireframeSphere && (
            <mesh>
              <sphereGeometry args={[5000, 32, 32]} />
              <meshBasicMaterial color="#00ff00" wireframe={true} transparent={true} opacity={0.3} />
            </mesh>
          )}
          
          {dreamNodes.map((node) => {
            // Check if we're in focused mode to disable dynamic scaling
            const isFocusedMode = spatialOrchestratorRef.current?.isFocusedMode() || false;
            const shouldEnableDynamicScaling = spatialLayout === 'constellation' && !isFocusedMode;
            
            // Removed excessive dynamic scaling logging for performance
            
            return (
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
                />
              </React.Fragment>
            );
          })}
        </group>
        
        {/* SpatialOrchestrator - manages all spatial interactions and layouts */}
        <SpatialOrchestrator
          ref={spatialOrchestratorRef}
          dreamNodes={dreamNodes}
          dreamWorldRef={dreamWorldRef}
          onNodeFocused={(nodeId) => {
            console.log(`DreamspaceCanvas: Node ${nodeId} focused by orchestrator`);
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