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
  const { creationState, completeCreation, cancelCreation } = useInterBrainStore();
  
  // Load dynamic nodes from mock service on mount and after creation
  useEffect(() => {
    const loadDynamicNodes = async () => {
      try {
        const service = serviceManager.getActive();
        // Don't reset on mount - preserve nodes across re-renders
        const nodes = await service.list();
        setDynamicNodes(nodes);
        console.log('DreamspaceCanvas: Loaded dynamic nodes on mount:', nodes.length);
      } catch (error) {
        console.error('Failed to load dynamic nodes:', error);
      }
    };
    
    loadDynamicNodes();
  }, []);
  
  // Debug logging for creation state
  React.useEffect(() => {
    console.log('DreamspaceCanvas - Creation state changed:', {
      isCreating: creationState.isCreating,
      hasProtoNode: !!creationState.protoNode,
      protoNode: creationState.protoNode
    });
  }, [creationState]);

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
      console.log('DreamspaceCanvas: Service returned nodes:', updatedNodes.map(n => ({
        id: n.id,
        name: n.name,
        position: n.position
      })));
      setDynamicNodes(updatedNodes);
      console.log('DreamspaceCanvas: Refreshed nodes after creation, total:', updatedNodes.length);
      
      // Add small delay to ensure new DreamNode renders before hiding proto-node
      globalThis.setTimeout(() => {
        console.log('DreamspaceCanvas: Completing creation after render delay');
        completeCreation();
      }, 100); // 100ms delay for rendering
      
    } catch (error) {
      console.error('Failed to create DreamNode:', error);
      // TODO: Show error message to user
    }
  };

  const handleProtoNodeCancel = () => {
    console.log('Proto-node creation cancelled');
    cancelCreation();
  };

  return (
    <div className="dreamspace-canvas-container">
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
            {console.log('Rendering ProtoNode3D at position:', creationState.protoNode.position)}
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