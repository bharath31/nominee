import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('published binary entrypoint', () => {
  it('runs through the npm bin symlink path', () => {
    const bin = fileURLToPath(new URL('../dist/bin.js', import.meta.url))
    const output = execFileSync(process.execPath, [bin, '--help'], { encoding: 'utf8' })

    expect(output).toContain('Usage:')
    expect(output).toContain('run the support-agent policy proof')
  })
})
