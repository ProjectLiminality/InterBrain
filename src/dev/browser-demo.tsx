import React from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import DreamNode3D from '../dreamspace/DreamNode3D';
import { generateMockDreamNodes } from '../mock/dreamnode-mock-data';
import { DreamNode } from '../types/dreamnode';

/**
 * Standalone browser demo for DreamSpace component
 * 
 * This allows us to develop and test the DreamSpace interface
 * directly in a browser without Obsidian, enabling:
 * - Playwright MCP automation
 * - Visual debugging and screenshots
 * - Hot reload development
 * - Cross-browser testing
 */

function BrowserDemo() {
  // Generate mock data directly in browser demo
  const dreamNodes = generateMockDreamNodes(12);

  const handleNodeHover = (node: DreamNode, isHovered: boolean) => {
    console.log(`Node ${node.name} hover:`, isHovered);
  };

  const handleNodeClick = (node: DreamNode) => {
    console.log(`Node clicked:`, node.name, node.type);
  };

  const handleNodeDoubleClick = (node: DreamNode) => {
    console.log(`Node double-clicked:`, node.name);
  };

  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      margin: 0, 
      padding: 0,
      overflow: 'hidden',
      background: '#000000',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Info overlay for development */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        color: '#FFFFFF',
        fontSize: '12px',
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '8px',
        borderRadius: '4px',
        zIndex: 1000,
        pointerEvents: 'none'
      }}>
        <div>DreamSpace Browser Demo</div>
        <div>Drag to rotate • Fixed 240px DreamNodes</div>
        <div>12 nodes on Fibonacci sphere • Clean foundational version</div>
      </div>

      {/* Direct Canvas implementation to avoid Obsidian dependencies */}
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
        {/* Render all DreamNodes directly */}
        {dreamNodes.map((node) => (
          <DreamNode3D
            key={node.id}
            dreamNode={node}
            onHover={handleNodeHover}
            onClick={handleNodeClick}
            onDoubleClick={handleNodeDoubleClick}
          />
        ))}
        
        {/* Camera controls - natural drag feeling */}
        <OrbitControls 
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          rotateSpeed={-0.5}  // Negative to invert drag direction
          zoomSpeed={0.3}
          minDistance={10}
          maxDistance={200}
          target={[0, 0, 0]}
          reverseOrbit={true}  // Additional inversion for natural feel
        />
        
        {/* Minimal ambient lighting */}
        <ambientLight intensity={0.1} />
      </Canvas>
    </div>
  );
}

// Mount the demo
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<BrowserDemo />);
} else {
  console.error('Root container not found');
}