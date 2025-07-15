import { Canvas } from '@react-three/fiber';
import { useRef } from 'react';
import { Group } from 'three';
import { generateMockDreamNodes } from '../mock/dreamnode-mock-data';
import DreamNode3D from './DreamNode3D';
import SphereRotationControls from './SphereRotationControls';
import { DreamNode } from '../types/dreamnode';
import { useInterBrainStore } from '../store/interbrain-store';

export default function DreamspaceCanvas() {
  // Generate mock data for testing - only Fibonacci sphere nodes
  const dreamNodes = generateMockDreamNodes(12);
  
  // Reference to the group containing all DreamNodes for rotation
  const dreamWorldRef = useRef<Group>(null);
  
  // Debug wireframe sphere state from store
  const debugWireframeSphere = useInterBrainStore(state => state.debugWireframeSphere);

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

  return (
    <div className="dreamspace-canvas-container">
      <Canvas
        camera={{
          position: [0, 0, 0],  // Static camera at origin
          fov: 75,
          near: 0.1,
          far: 10000
        }}
        style={{
          width: '100%',
          height: '100%',
          background: '#000000'
        }}
      >
        {/* Rotatable group containing all DreamNodes */}
        <group ref={dreamWorldRef}>
          {/* Debug wireframe sphere - toggleable via Obsidian commands */}
          {debugWireframeSphere && (
            <mesh>
              <sphereGeometry args={[1000, 32, 32]} />
              <meshBasicMaterial color="#00ff00" wireframe={true} transparent={true} opacity={0.3} />
            </mesh>
          )}
          
          {dreamNodes.map((node) => (
            <DreamNode3D
              key={node.id}
              dreamNode={node}
              onHover={handleNodeHover}
              onClick={handleNodeClick}
              onDoubleClick={handleNodeDoubleClick}
            />
          ))}
        </group>
        
        {/* Mouse drag controls for rotating the sphere */}
        <SphereRotationControls groupRef={dreamWorldRef} />
        
        {/* Ambient lighting for any 3D elements (minimal) */}
        <ambientLight intensity={0.1} />
      </Canvas>
    </div>
  );
}