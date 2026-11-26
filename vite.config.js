import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // true only for dist/bomb.html (scripts/build-variants.mjs): the bomb app alone, no heist code
  define: { __BOMB_ONLY__: 'false' },
  root: '.',
  server: {
    port: 3000,
    open: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});


