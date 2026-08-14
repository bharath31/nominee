import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../src/cli.js'

const distBin = fileURLToPath(new URL('../dist/bin.js', import.meta.url))

describe('cli dispatch', () => {
  let logs: string[]

  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs the proof for no arguments and exits 0', async () => {
    const code = await main([])
    expect(code).toBe(0)
    expect(logs.join('\n')).toContain('Install: npm i nominee')
  }, 10_000)

  it('prints usage and exits 1 for "verify" with no file', async () => {
    const code = await main(['verify'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('Usage: nominee verify <file>')
  })

  it('prints usage and exits 1 for "check" with no file', async () => {
    const code = await main(['check'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('Usage: nominee check <policy-file>')
  })

  it('prints usage and exits 1 for "activate" without both artifacts', async () => {
    const code = await main(['activate', 'policy.mjs'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('Usage: nominee activate <policy-file> <receipts.json>')
  })

  it('shows help and exits 0 for --help', async () => {
    const code = await main(['--help'])
    expect(code).toBe(0)
    expect(logs.join('\n')).toContain('Usage:')
  })

  it('reports an unknown command and exits 1', async () => {
    const code = await main(['bogus'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('unknown command "bogus"')
  })

  it('reports "console" as not yet implemented and exits 1', async () => {
    const code = await main(['console'])
    expect(code).toBe(1)
    expect(logs.join('\n')).toContain('not implemented yet')
  })
})

// Regression coverage for the real `npx nominee-cli` path: npm installs the
// package's bin as a symlink (node_modules/.bin/nominee -> dist/bin.js), not
// a direct file execution. Calling main() directly (above) never exercises
// that path, so this spawns the dedicated bin entry through an actual symlink,
// exactly like npm does.
describe.skipIf(!existsSync(distBin))(
  'bin entry point (symlinked, like a real npm install)',
  () => {
    it('runs the proof when invoked through a symlink and exits 0', () => {
      const dir = mkdtempSync(join(tmpdir(), 'nominee-cli-bin-test-'))
      const link = join(dir, 'nominee')
      symlinkSync(distBin, link)
      try {
        const output = execFileSync(link, [], { encoding: 'utf8' })
        expect(output).toContain('Install: npm i nominee')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }, 10_000)
  },
)
