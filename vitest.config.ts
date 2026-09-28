import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/unit/worker/**', '**/*.workers.test.ts'],
    environment: 'node',
  },
});
