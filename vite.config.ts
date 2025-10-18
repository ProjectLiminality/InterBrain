import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    }
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'InterBrain',
      fileName: 'main',
      formats: ['cjs']
    },
    rollupOptions: {
      external: [
        'obsidian',
        'child_process',
        'util',
        'path',
        'fs',
        'url',
        'buffer',
        'crypto',
        'stream',
        'os'
      ],
      output: {
        globals: {
          obsidian: 'obsidian'
        },
        // Disable code splitting for Obsidian plugins
        manualChunks: undefined,
        inlineDynamicImports: true
      }
    },
    outDir: 'dist',
    emptyOutDir: false
  },
  define: {
    global: 'globalThis'
  }
})