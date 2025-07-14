import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Browser development configuration for DreamSpace demo
export default defineConfig({
  plugins: [react()],
  root: 'src/dev', // Serve from dev directory
  server: {
    port: 5173, // Standard Vite port for consistency
    host: '0.0.0.0', // Allow external access for Playwright MCP
    open: true,
    cors: true
  },
  define: {
    global: 'globalThis'
  },
  resolve: {
    alias: {
      // Mock Obsidian for browser development
      'obsidian': resolve(__dirname, 'src/mocks/obsidian.ts'),
      // Resolve imports relative to src directory
      '~': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: '../../dist-dev', // Output outside src/dev
    emptyOutDir: true
  }
})