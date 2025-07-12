import React from 'react'

export function InterBrainApp() {
  return (
    <div style={{ 
      padding: '80px 20px 20px', 
      textAlign: 'center',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <h1 style={{ 
        fontSize: '3rem', 
        marginBottom: '1rem',
        background: 'linear-gradient(45deg, #00a2ff, #ff644e)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }}>
        InterBrain
      </h1>
      <p style={{ fontSize: '1.2rem', opacity: 0.8, marginBottom: '2rem' }}>
        Revolutionary Knowledge Management System
      </p>
      <div style={{
        padding: '20px',
        border: '1px solid #333',
        borderRadius: '8px',
        backgroundColor: '#2a2a2a',
        maxWidth: '600px'
      }}>
        <h3>🚀 Vite + React Development Environment</h3>
        <p>This is the browser development mode for InterBrain. You can develop React components here with instant hot reload!</p>
        <ul style={{ textAlign: 'left', paddingLeft: '20px' }}>
          <li>✅ Vite configured for instant hot reload</li>
          <li>✅ React + TypeScript integration</li>
          <li>✅ Obsidian API mocked for browser development</li>
          <li>🔄 Ready for React Three Fiber components</li>
        </ul>
      </div>
    </div>
  )
}