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
    (globalThis as any).__interbrainCanvas = {
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
      case 'search':
        // Trigger search results display when switching to search mode
        if (searchResults && searchResults.length > 0) {
          console.log(`DreamspaceCanvas: Switching to search mode with ${searchResults.length} results`);
          spatialOrchestratorRef.current.showSearchResults(searchResults);
        }
        break;
        
      case 'liminal-web':
        // Trigger liminal web when a node is selected
        if (selectedNode) {
          console.log(`DreamspaceCanvas: Switching to liminal web mode for node: ${selectedNode.name}`);
          spatialOrchestratorRef.current.focusOnNode(selectedNode.id);
        }
        break;
        
      case 'constellation':
        // Return to constellation
        console.log('DreamspaceCanvas: Returning to constellation mode');
        spatialOrchestratorRef.current.returnToConstellation();
        break;
    }
  }, [spatialLayout, searchResults, selectedNode]); // Watch spatial layout, search results, and selected node
  
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
    // Update selected node in store
    const store = useInterBrainStore.getState();
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
      
      
      // Use service to create node
      const service = serviceManager.getActive();
      
      // Find first valid media file for dreamTalk
      const dreamTalkFile = files.find(f => isValidMediaFile(f));
      const additionalFiles = files.filter(f => f !== dreamTalkFile);
      
      // Create node with all files
      await service.create(
        fileNameWithoutExt,
        'dream', // Always create Dream-type for normal drops
        dreamTalkFile,
        position,
        additionalFiles // Pass all other files
      );
      
      // No need to manually refresh - event listener will handle it
      
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
          
          if (store.spatialLayout === 'search') {
            // Clear search and return to constellation
            console.log('Empty space clicked in search mode - clearing search');
            store.setSearchResults([]);
            store.setSpatialLayout('constellation');
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