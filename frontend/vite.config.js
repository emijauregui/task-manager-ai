import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Resolve aliases for clean imports
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Dev server proxy — forwards /api/* to local backend on port 3000
  // This mirrors the Netlify proxy redirect so local dev works identically
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },

  // Production build outputs to frontend/dist
  // netlify.toml will point publish = "frontend/dist"
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
