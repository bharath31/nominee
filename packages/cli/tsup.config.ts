import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts', 'src/bin.ts', 'src/console-client.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})
