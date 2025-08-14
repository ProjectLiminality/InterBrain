import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@xenova/transformers', 'vectra'],
    exclude: ['obsidian']
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'InterBrain',
      fileName: 'main',
      formats: ['cjs']
    },
    rollupOptions: {
      external: ['obsidian'],
      output: {
        globals: {
          obsidian: 'obsidian'
        }
        // Remove manualChunks - Obsidian plugins need everything in main.js
      }
    },
    outDir: 'dist',
    emptyOutDir: false
  },
  define: {
    global: 'globalThis'
  }
})