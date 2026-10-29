import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = name => fileURLToPath(new URL(name, import.meta.url));

// base './' keeps the build relocatable: dist/ works from any subpath or straight off a static host.
// Three pages: the explorer (index.html), 4D chess (chess.html, whose computer opponent runs in a module worker)
// and the 4D spinning cat (cat.html).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020', chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: page('./index.html'), chess: page('./chess.html'), cat: page('./cat.html') },
      output: { manualChunks: id => (id.includes('/node_modules/three/') ? 'three' : undefined) },   // all three pages share one three.js chunk
    },
  },
  worker: { format: 'es' },
});
