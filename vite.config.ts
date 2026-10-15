import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  // `npm run dev:api` serves the tgcloud endpoints locally on :8787 (see dev/server.mjs).
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
