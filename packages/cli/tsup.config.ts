import { defineConfig } from 'tsup'

// tsup auto-detects a leading `#!/usr/bin/env node` shebang (see its
// shebang plugin) and chmods the emitted chunk to 0o755 — no extra banner
// config needed for `dist/cli.js` to work as the `bin` entry.
export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
})
