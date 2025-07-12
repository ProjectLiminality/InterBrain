import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
      }
    },
    outDir: 'dist',
    emptyOutDir: false
  },
  define: {
    global: 'globalThis'
  }
})