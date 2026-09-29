import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { browserProfileApi } from './vite-plugin-browser-api';

const ROOT = 'D:/HERMES AGENT/ICON Email Browser Lab';

export default defineConfig({
  root: 'apps/web',
  plugins: [
    react(),
    browserProfileApi(),
  ],
  resolve: {
    alias: {
      '@': resolve(ROOT, 'apps/web/src'),
      '@shared': resolve(ROOT, 'packages/shared/src'),
      '@database': resolve(ROOT, 'packages/database/src'),
      '@email': resolve(ROOT, 'packages/email/src'),
      '@browser': resolve(ROOT, 'packages/browser/src'),
      '@automation': resolve(ROOT, 'packages/automation/src'),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: resolve(ROOT, 'dist'),
    sourcemap: true,
  },
});
