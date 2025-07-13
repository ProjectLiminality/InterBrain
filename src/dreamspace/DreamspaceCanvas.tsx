import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { generateMockDreamNodes, getMockDreamNode, getEmptyMockDreamNode } from '../mock/dreamnode-mock-data';
import DreamNode3D from './DreamNode3D';
import { DreamNode } from '../types/dreamnode';

export default function DreamspaceCanvas() {
  // Generate mock data for testing
  const dreamNodes = generateMockDreamNodes(12);
  
  // Add a few special test nodes
  const testNodes = [
    getMockDreamNode(),
    getEmptyMockDreamNode()
  ];
  
  const allNodes = [...dreamNodes, ...testNodes];

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
          position: [0, 0, 1000],
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
        {/* Render all DreamNodes */}
        {allNodes.map((node) => (
          <DreamNode3D
            key={node.id}
            dreamNode={node}
            onHover={handleNodeHover}
            onClick={handleNodeClick}
            onDoubleClick={handleNodeDoubleClick}
          />
        ))}
        
        {/* Camera controls for navigation */}
        <OrbitControls 
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true}
          zoomSpeed={0.5}
          rotateSpeed={0.5}
          panSpeed={0.5}
        />
        
        {/* Ambient lighting for any 3D elements (minimal) */}
        <ambientLight intensity={0.1} />
      </Canvas>
    </div>
  );
}