import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  // MapLibre GL v3 ships a UMD build — let Vite pre-bundle it (esbuild turns
  // it into proper ESM with a default export). v3 creates its Web Worker via
  // a blob, so no optimizeDeps.exclude is needed (unlike v6).
});
