import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/integration/**/*.integration.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 60000,
  },
});
