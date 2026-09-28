import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        sockDemo: resolve(root, 'sock-demo.html'),
        admin: resolve(root, 'admin.html'),
        favoris: resolve(root, 'favoris.html'),
        kit: resolve(root, 'kit.html'),
        motif: resolve(root, 'motif.html'),
      },
    },
  },
});
