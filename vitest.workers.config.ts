import { defineConfig } from 'vitest/config';

/**
 * Suite Worker / D1 (getPlatformProxy). Lancée par `npm test` après les unitaires node.
 * Voir D70.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/worker/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
