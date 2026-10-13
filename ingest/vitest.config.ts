import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Integration tests share one database and truncate kc_* tables.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
