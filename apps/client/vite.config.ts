import { defineConfig } from 'vite';

export default defineConfig({
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    // PixiJS is large; keep it in its own chunk.
    chunkSizeWarningLimit: 1200,
  },
});
