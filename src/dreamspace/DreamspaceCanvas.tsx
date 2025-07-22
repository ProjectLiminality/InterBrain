import React, { useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import { Group, Vector3, Raycaster, Sphere } from 'three';
import { FlyControls } from '@react-three/drei';
import { getMockDataForConfig } from '../mock/dreamnode-mock-data';
import DreamNode3D from './DreamNode3D';
import Star3D from './Star3D';
import SphereRotationControls from './SphereRotationControls';
import ProtoNode3D from '../features/creation/ProtoNode3D';
import { DreamNode } from '../types/dreamnode';
import { useInterBrainStore, ProtoNode } from '../store/interbrain-store';
import { serviceManager } from '../services/service-manager';
import { CAMERA_INTERSECTION_POINT } from './DynamicViewScaling';

export default function DreamspaceCanvas() {
  // Get mock data configuration from store
  const mockDataConfig = useInterBrainStore(state => state.mockDataConfig);
  
  // State for dynamic nodes from mock service
  const [dynamicNodes, setDynamicNodes] = useState<DreamNode[]>([]);
  
  // Drag and drop state
  const [, setIsDragOver] = useState(false); // Keep for state management but remove unused variable warning
  const [dragMousePosition, setDragMousePosition] = useState<{ x: number; y: number } | null>(null);
  
  // Combine static mock data with dynamic service nodes
  const staticNodes = getMockDataForConfig(mockDataConfig);
  const dreamNodes = [...staticNodes, ...dynamicNodes];
  
  // Reference to the group containing all DreamNodes for rotation
  const dreamWorldRef = useRef<Group>(null);
  
  // Debug visualization states from store
  const debugWireframeSphere = useInterBrainStore(state => state.debugWireframeSphere);
  const debugIntersectionPoint = useInterBrainStore(state => state.debugIntersectionPoint);
  const debugFlyingControls = useInterBrainStore(state => state.debugFlyingControls);
  
  // Layout state for controlling dynamic view scaling
  const spatialLayout = useInterBrainStore(state => state.spatialLayout);
  
  // Creation state for proto-node rendering
  const { creationState, startCreationWithData, completeCreation, cancelCreation } = useInterBrainStore();
  
  // Load dynamic nodes from mock service on mount and after creation
  useEffect(() => {
    const loadDynamicNodes = async () => {
      try {
        const service = serviceManager.getActive();
        // Don't reset on mount - preserve nodes across re-renders
        const nodes = await service.list();
        setDynamicNodes(nodes);
        // Loaded dynamic nodes successfully
      } catch (error) {
        console.error('Failed to load dynamic nodes:', error);
      }
    };
    
    loadDynamicNodes();
  }, []);
  
  // Debug logging for creation state (removed excessive logging)

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
    
    console.log('Position calculation:', {
      mouse: { x: mouseX, y: mouseY },
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      ndc: { x: ndcX, y: ndcY }
    });
    
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
      
      console.log('Intersection found:', {
        worldPosition: intersectionPoint.toArray(),
        sphereRotation: sphereRotation.toArray()
      });
      
      return intersectionPoint.toArray() as [number, number, number];
    }
    
    console.warn('No intersection found with sphere - using fallback');
    // Fallback to forward position
    return [0, 0, -5000];
  };

  const handleNodeHover = (node: DreamNode, isHovered: boolean) => {
    console.log(`Node ${node.name} hover:`, isHovered);
  };

  const handleNodeClick = (node: DreamNode) => {
    console.log(`Node clicked:`, node.name, node.type);
  };

  const handleNodeDoubleClick = (node: DreamNode) => {
    console.log(`Node double-clicked:`, node.name);
    // TODO: Open DreamSong view
  };

  const handleProtoNodeComplete = async (protoNode: ProtoNode) => {
    try {
      console.log('Creating DreamNode:', protoNode);
      
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
          
          console.log('Raycaster intersection with rotated sphere:', {
            sphereRotation: sphereRotation.toArray(),
            rayOrigin: cameraPosition.toArray(),
            rayDirection: cameraDirection.toArray(),
            intersectionPoint: intersectionPoint.toArray(),
            finalPosition: finalPosition
          });
        } else {
          console.warn('No intersection found with sphere - using default position');
          finalPosition = [0, 0, -5000]; // Fallback to forward position
        }
      }
      
      // Use the service manager to create the node
      const service = serviceManager.getActive();
      const newNode = await service.create(
        protoNode.title,
        protoNode.type,
        protoNode.dreamTalkFile,
        finalPosition // Pass rotation-adjusted position to project onto sphere
      );
      
      console.log('DreamNode created successfully:', newNode);
      
      // Refresh the dynamic nodes list to include the new node
      const updatedNodes = await service.list();
      setDynamicNodes(updatedNodes);
      
      // Add small delay to ensure new DreamNode renders before hiding proto-node
      globalThis.setTimeout(() => {
        completeCreation();
      }, 100); // 100ms delay for rendering
      
    } catch (error) {
      console.error('Failed to create DreamNode:', error);
      // TODO: Show error message to user
    }
  };

  const handleProtoNodeCancel = () => {
    cancelCreation();
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
    
    const isCommandDrop = e.metaKey || e.ctrlKey; // Command on Mac, Ctrl on Windows/Linux
    
    console.log('Drop detected:', {
      fileCount: files.length,
      isCommandDrop,
      files: files.map(f => ({ name: f.name, type: f.type, size: f.size }))
    });
    
    if (isCommandDrop) {
      // Command+Drop: Open ProtoNode3D with file pre-filled
      // Use the same position as the Create DreamNode command
      await handleCommandDrop(files);
    } else {
      // Normal Drop: Create node instantly at mouse position
      const mousePos = dragMousePosition || { x: e.clientX, y: e.clientY };
      const position = calculateDropPosition(mousePos.x, mousePos.y);
      await handleNormalDrop(files, position);
    }
    
    setDragMousePosition(null);
  };

  const handleNormalDrop = async (files: globalThis.File[], position: [number, number, number]) => {
    try {
      const file = files[0]; // Use first file for single node creation
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
      
      console.log('Creating node instantly:', { title: fileNameWithoutExt, position });
      
      // Use service to create node
      const service = serviceManager.getActive();
      const dreamTalkFile = isValidMediaFile(file) ? file : undefined;
      
      const newNode = await service.create(
        fileNameWithoutExt,
        'dream', // Always create Dream-type for normal drops
        dreamTalkFile,
        position
      );
      
      console.log('Node created successfully:', newNode);
      
      // Refresh dynamic nodes list
      const updatedNodes = await service.list();
      setDynamicNodes(updatedNodes);
      
    } catch (error) {
      console.error('Failed to create node from drop:', error);
      // TODO: Show user error message
    }
  };

  const handleCommandDrop = async (files: globalThis.File[]) => {
    try {
      const file = files[0]; // Use first file for pre-filling
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
      
      // Use the EXACT same position as the Create DreamNode command
      const spawnPosition: [number, number, number] = [0, 0, -25];
      
      console.log('Opening ProtoNode with pre-filled file:', { 
        title: fileNameWithoutExt, 
        file: file.name, 
        position: spawnPosition 
      });
      
      // Pre-fill the proto node with file data
      const dreamTalkFile = isValidMediaFile(file) ? file : undefined;
      
      // Start creation with pre-filled data in a single action
      startCreationWithData(spawnPosition, {
        title: fileNameWithoutExt,
        type: 'dream',
        dreamTalkFile: dreamTalkFile
      });
      
      console.log('ProtoNode creation started with data at standard position');
      
    } catch (error) {
      console.error('Failed to start creation from drop:', error);
      // TODO: Show user error message
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
          
          {dreamNodes.map((node) => (
            <React.Fragment key={node.id}>
              {/* Star component - purely visual, positioned slightly closer than anchor */}
              {spatialLayout === 'constellation' && (
                <Star3D
                  position={node.position}
                  size={5000}
                />
              )}
              
              {/* DreamNode component - handles all interactions and dynamic positioning */}
              <DreamNode3D
                dreamNode={node}
                onHover={handleNodeHover}
                onClick={handleNodeClick}
                onDoubleClick={handleNodeDoubleClick}
                enableDynamicScaling={spatialLayout === 'constellation'}
              />
            </React.Fragment>
          ))}
        </group>
        
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