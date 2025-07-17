import React from 'react';
import { createRoot } from 'react-dom/client';
import DreamspaceCanvas from '../dreamspace/DreamspaceCanvas';

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
        <div>Click & drag to rotate sphere • Static camera architecture</div>
        <div>12 nodes on Fibonacci sphere • Natural sphere interaction</div>
      </div>

      {/* Use the same DreamspaceCanvas component as the Obsidian plugin */}
      <DreamspaceCanvas />
    </div>
  );
}

// Mount the demo
const container = (globalThis as any).document?.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<BrowserDemo />);
} else {
  console.error('Root container not found');
}