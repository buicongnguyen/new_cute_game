import { defineConfig } from 'vite';

// GitHub Pages serves the game under /<repo>/; the workflow passes it as VITE_BASE_PATH.
const configured = process.env.VITE_BASE_PATH || '/';
const base = configured.endsWith('/') ? configured : `${configured}/`;

export default defineConfig({
  base,
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: { output: { manualChunks: id => (id.includes('/node_modules/three/') ? 'three' : undefined) } },
  },
});
