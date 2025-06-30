import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    },
    proxy: {
      '/api': 'http://localhost:3456',
      '/ws': {
        target: 'ws://localhost:3456',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['svelte'],
          chess: ['chessground', 'chessops']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['chessground', 'chessops/chess', 'chessops/fen', 'chessops/util', 'chessops/compat', 'chessops/san']
  },
  worker: {
    format: 'es'
  },
  assetsInclude: ['**/*.wasm'],
  define: {
    global: 'globalThis',
  }
}) 