import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Plugin to replace onnxruntime-node with onnxruntime-web
const replaceOnnxPlugin = () => {
  return {
    name: 'replace-onnx-runtime',
    transform(code: string, id: string) {
      if (id.includes('transformers') || id.includes('onnx')) {
        // Replace all references to onnxruntime-node with onnxruntime-web
        code = code.replace(/onnxruntime-node/g, 'onnxruntime-web')
      }
      return code
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), replaceOnnxPlugin()],
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
      external: ['obsidian', 'onnxruntime-node'], // Exclude node runtime
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
  resolve: {
    alias: {
      // Force transformers.js to use web version of ONNX runtime
      'onnxruntime-node': 'onnxruntime-web'
    }
  },
  define: {
    global: 'globalThis',
    // Override environment detection for transformers.js
    'process.versions.node': 'undefined',
    'process.versions.electron': 'undefined'
  }
})