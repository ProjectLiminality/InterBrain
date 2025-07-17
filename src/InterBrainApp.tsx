import React from 'react'
import DreamspaceCanvas from './dreamspace/DreamspaceCanvas'

export function InterBrainApp() {
  return (
    <div style={{ 
      height: '100vh',
      width: '100vw',
      position: 'relative'
    }}>
      {/* Development banner */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: '#ff6b6b',
        color: 'white',
        textAlign: 'center',
        padding: '8px',
        fontSize: '14px',
        zIndex: 1000
      }}>
        🚀 InterBrain Browser Development Mode - React 3 Fiber Hot Reload Enabled
      </div>
      
      {/* DreamSpace canvas - same as Obsidian plugin */}
      <div style={{
        position: 'absolute',
        top: '40px', // Account for dev banner
        left: 0,
        right: 0,
        bottom: 0
      }}>
        <DreamspaceCanvas />
      </div>
    </div>
  )
}