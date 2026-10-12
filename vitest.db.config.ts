import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

// Database tests: need a Postgres prepared by `scripts/test-db.sh start` (or CI's service).
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['tests/db/**/*.test.ts'],
      fileParallelism: false,
      testTimeout: 20000,
    },
  }),
);
