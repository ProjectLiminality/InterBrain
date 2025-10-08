import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Vite config for building standalone DreamSong site for GitHub Pages
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  base: './', // Relative paths for GitHub Pages
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    },
    // Inline small assets as base64
    assetsInlineLimit: 4096
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../../')
    }
  }
});
