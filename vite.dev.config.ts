import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Browser development configuration
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  define: {
    global: 'globalThis'
  },
  resolve: {
    alias: {
      // Mock Obsidian for browser development
      'obsidian': resolve(__dirname, 'src/mocks/obsidian.ts')
    }
  }
})