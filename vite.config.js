import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'supabase': ['@supabase/supabase-js'],
          'jssip': ['jssip'],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    open: true,
    host: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});