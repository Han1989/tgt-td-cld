import { defineConfig } from 'vitest/config';

export default defineConfig({
  // As the site's own build sets them (vite.config.ts): no hosted build in the unit tests.
  define: { __EMBED__: 'null' },
  test: {
    name: 'client',
    include: ['test/**/*.test.ts'],
  },
});
