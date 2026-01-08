import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['tests/setup-env.ts'],
    // Prevent tests from hanging
    testTimeout: 10000,        // 10s max per test
    hookTimeout: 10000,        // 10s max for beforeEach/afterEach
    teardownTimeout: 5000,     // 5s max for cleanup
    // Disable watch mode by default
    watch: false,
    // Use single isolate for predictable cleanup (Vitest 4 syntax)
    isolate: true,
    fileParallelism: false,    // Run files sequentially for stability
  },
});
