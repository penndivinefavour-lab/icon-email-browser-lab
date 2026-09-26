import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    root: '.',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
