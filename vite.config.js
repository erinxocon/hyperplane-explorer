import { defineConfig } from 'vite';

// base './' keeps the build relocatable: dist/ works from any subpath or straight off a static host.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
