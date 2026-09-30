import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx'],
    // The database suite is written against Node's built-in `node:test` runner
    // and is executed with `npx tsx --test`. Vitest cannot collect a file that
    // imports no vitest API, so it is kept out of this run rather than being
    // reported as a failing suite.
    exclude: ['**/node_modules/**', 'packages/database/src/index.test.ts'],
    root: '.',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
