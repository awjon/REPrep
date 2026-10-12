import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `server-only` throws outside the react-server condition; in unit tests it is a no-op.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['lib/deadlines/**'],
      thresholds: { 'lib/deadlines/**': { branches: 100, lines: 100, functions: 100, statements: 100 } },
    },
  },
});
