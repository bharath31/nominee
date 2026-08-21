import { defineConfig } from 'vitest/config'

// Restrict to this package's own tests - `site/agent-worker` is a separate
// workspace package with its own `vitest run`, and without this vitest's
// default recursive glob would pick up (and double-run) its test files too.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
