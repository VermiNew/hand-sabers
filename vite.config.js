import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Vite jest opcjonalny: domyślne `npm start` nadal odpala Express na porcie 3000.
// Przy `npm run client` frontend działa na 5173, a zapytania /api lecą do Expressa.
export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        game: resolve(__dirname, 'beat-sabers-3d.html'),
        maps: resolve(__dirname, 'maps.html'),
        creator: resolve(__dirname, 'map-creator.html'),
        cameraDiagnostics: resolve(__dirname, 'camera-diagnostics.html'),
        remoteCamera: resolve(__dirname, 'remote-camera.html'),
        serviceWorker: resolve(__dirname, 'service-worker.js'),
      },
      output: {
        entryFileNames: chunk => chunk.name === 'serviceWorker'
          ? 'service-worker.js'
          : 'assets/[name]-[hash].js',
      },
    },
  },
});
