import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { generateMockDreamNodes } from '../mock/dreamnode-mock-data';
import DreamNode3D from './DreamNode3D';
import { DreamNode } from '../types/dreamnode';

export default function DreamspaceCanvas() {
  // Generate mock data for testing - only Fibonacci sphere nodes
  const dreamNodes = generateMockDreamNodes(12);

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
          position: [0, 0, 0],
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
        {dreamNodes.map((node) => (
          <DreamNode3D
            key={node.id}
            dreamNode={node}
            onHover={handleNodeHover}
            onClick={handleNodeClick}
            onDoubleClick={handleNodeDoubleClick}
          />
        ))}
        
        {/* Camera controls for navigation - camera at origin */}
        <OrbitControls 
          enablePan={false}  // No panning, only rotation at origin
          enableZoom={false} // No zoom, camera stays at origin
          enableRotate={true}
          rotateSpeed={0.5}
          minDistance={0}
          maxDistance={0}
          target={[0, 0, 0]}
        />
        
        {/* Ambient lighting for any 3D elements (minimal) */}
        <ambientLight intensity={0.1} />
      </Canvas>
    </div>
  );
}