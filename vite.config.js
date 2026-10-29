import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = name => fileURLToPath(new URL(name, import.meta.url));

// base './' keeps the build relocatable: dist/ works from any subpath or straight off a static host.
// Two pages: the explorer (index.html) and 4D chess (chess.html), whose computer opponent runs in a module worker.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020', chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: page('./index.html'), chess: page('./chess.html') },
      output: { manualChunks: id => (id.includes('/node_modules/three/') ? 'three' : undefined) },   // both pages share one three.js chunk
    },
  },
  worker: { format: 'es' },
});
