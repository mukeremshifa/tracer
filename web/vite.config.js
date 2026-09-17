import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The analyser is shared with the server-side eval harness, so it lives
    // outside web/. Vite needs permission to serve from the repo root.
    fs: { allow: [root, repo] },
    proxy: {
      '/api': 'http://localhost:8787',
      '/range': 'http://localhost:8787',
      '/arena': 'http://localhost:8787',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
