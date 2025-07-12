import React from 'react'
import ReactDOM from 'react-dom/client'
import { InterBrainApp } from './InterBrainApp'

// Browser development entry point
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <InterBrainApp />
  </React.StrictMode>,
)