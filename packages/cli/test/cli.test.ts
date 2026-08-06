/**
 * End-to-end tests against the built `dist/cli.js` — the same binary `npx
 * nominee` runs. Requires `pnpm build` to have run first (as it always does
 * ahead of `pnpm test`, per the repo's before-a-PR checklist).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Nominee, allow } from 'nominee'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url))
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

function run(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
    return { stdout, stderr: '', status: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', status: e.status ?? 1 }
  }
}

let dir: string

beforeAll(() => {
  if (!existsSync(CLI)) {
    throw new Error(`${CLI} does not exist — run "pnpm --filter nominee-cli build" first`)
  }
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nominee-cli-e2e-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('nominee (no args)', () => {
  it('runs the injection-blocked proof and exits 0', () => {
    const { stdout, status } = run([])
    expect(status).toBe(0)
    expect(stdout).toContain('BLOCKED before the tool ran')
    expect(stdout).toContain('receipts intact')
    expect(stdout).toContain('Install: npm i nominee')
  })
})

describe('nominee verify', () => {
  it('exits 0 and prints the intact count for a good receipt file', async () => {
    const nominee = new Nominee({
      policy: { rules: [allow('email.read')], fallback: 'deny' },
      receipts: { key: 'test-key' },
    })
    await nominee.authorize({ tool: 'email.read', user: 'alice' })
    const file = join(dir, 'receipts.json')
    writeFileSync(file, JSON.stringify(nominee.receipts))

    const { stdout, status } = run(['verify', file], { NOMINEE_RECEIPT_KEY: 'test-key' })
    expect(status).toBe(0)
    expect(stdout.trim()).toBe(`✓ ${nominee.receipts.length} receipts intact`)
  })

  it('exits 1 and reports the break for a tampered receipt file', async () => {
    const nominee = new Nominee({
      policy: { rules: [allow('email.read')], fallback: 'deny' },
      receipts: { key: 'test-key' },
    })
    await nominee.authorize({ tool: 'email.read', user: 'alice' })
    const doctored = nominee.receipts.map((r) => ({ ...r, tool: 'tampered' }))
    const file = join(dir, 'receipts.json')
    writeFileSync(file, JSON.stringify(doctored))

    const { stdout, status } = run(['verify', file])
    expect(status).toBe(1)
    expect(stdout).toMatch(/^✕ broken at #0/)
  })
})

describe('nominee check', () => {
  it('exits 0 when every rule matches a sample call', () => {
    const { stdout, status } = run(['check', fixture('good-policy.mjs')])
    expect(status).toBe(0)
    expect(stdout).toContain('matched at least one sample call')
  })

  it('exits 1 and suggests a fix for a rule that never matches', () => {
    const { stdout, status } = run(['check', fixture('typo-policy.mjs')])
    expect(status).toBe(1)
    expect(stdout).toContain('never matched any sample call — did you mean "email.read"?')
  })
})

describe('argv dispatch', () => {
  it('rejects an unknown command', () => {
    const { stderr, status } = run(['bogus'])
    expect(status).toBe(1)
    expect(stderr).toContain('Unknown command: bogus')
  })
})
