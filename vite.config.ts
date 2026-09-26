import { defineConfig } from 'vite';

export default defineConfig({
  root: 'apps/web',
  build: {
    outDir: '../../dist/web',
    sourcemap: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  esbuild: {
    target: 'es2022',
  },
});
