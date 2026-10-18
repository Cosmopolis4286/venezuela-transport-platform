import { defineConfig } from 'vitest/config';

// Only the framework-free modules (API client, session logic) are unit-tested here;
// screens are exercised through the apps.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
