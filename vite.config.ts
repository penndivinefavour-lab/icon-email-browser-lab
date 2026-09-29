import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const ROOT = 'D:/HERMES AGENT/ICON Email Browser Lab';

export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(ROOT, 'packages/shared/src'),
      '@database': resolve(ROOT, 'packages/database/src'),
      '@email': resolve(ROOT, 'packages/email/src'),
      '@browser': resolve(ROOT, 'packages/browser/src'),
      '@automation': resolve(ROOT, 'packages/automation/src'),
    },
  },
  build: {
    outDir: '../../dist/web',
    sourcemap: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});