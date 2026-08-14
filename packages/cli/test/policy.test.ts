import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Nominee, type ObservationReportV2 } from 'nominee'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runCheck } from '../src/check.js'
import { generateStarterPolicy, parseObservationReport, runGeneratePolicy } from '../src/policy.js'

const here = dirname(fileURLToPath(import.meta.url))

function report(): ObservationReportV2 {
  return {
    mode: 'observe',
    version: 2,
    generatedAt: Date.UTC(2026, 7, 8),
    window: { from: Date.UTC(2026, 7, 1), to: Date.UTC(2026, 7, 8) },
    totals: { calls: 5, tools: 3, allow: 5, ask: 0, deny: 0 },
    policyConfigured: false,
    availableTools: ['orders.read', 'refund.issue', 'mystery', 'customers.delete'],
    tools: [
      {
        tool: 'orders.read',
        calls: 1,
        firstSeenAt: Date.UTC(2026, 7, 1),
        lastSeenAt: Date.UTC(2026, 7, 1),
        users: 1,
        kind: 'read',
        verdicts: { allow: 1, ask: 0, deny: 0 },
        baseline: 'allow',
        arguments: [
          {
            name: 'query',
            types: ['string'],
            present: 1,
            unbounded: true,
          },
        ],
        unboundedArguments: ['query'],
      },
      {
        tool: 'refund.issue',
        calls: 3,
        firstSeenAt: Date.UTC(2026, 7, 2),
        lastSeenAt: Date.UTC(2026, 7, 8),
        users: 1,
        kind: 'mutate',
        verdicts: { allow: 3, ask: 0, deny: 0 },
        baseline: 'ask',
        arguments: [
          {
            name: 'amount',
            types: ['number'],
            present: 3,
            range: { min: 5, max: 180, median: 25 },
            unbounded: true,
          },
        ],
        unboundedArguments: ['amount'],
      },
      {
        tool: 'mystery',
        calls: 1,
        firstSeenAt: Date.UTC(2026, 7, 3),
        lastSeenAt: Date.UTC(2026, 7, 3),
        users: 1,
        kind: 'unknown',
        verdicts: { allow: 1, ask: 0, deny: 0 },
        baseline: 'ask',
        arguments: [],
        unboundedArguments: [],
      },
    ],
  }
}

describe('starter policy generator', () => {
  let dir: string
  let logs: string[]

  beforeEach(() => {
    dir = mkdtempSync(join(here, '.tmp-policy-'))
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('emits evidence-backed allow, threshold, ask, unused deny, and fallback rules', () => {
    const source = generateStarterPolicy(report())

    expect(source).toContain('observations, not security recommendations')
    expect(source).toContain('allow("orders.read")')
    expect(source).toContain('"amount" in input')
    expect(source).toContain('input["amount"] <= 25')
    expect(source).toContain('ask("refund.issue")')
    expect(source).toContain('ask("mystery")')
    expect(source).toContain('deny("customers.delete")')
    expect(source).toContain("fallback: 'deny'")
    expect(source).toContain('Exposure observed: "amount"')
    expect(source).toContain('Exposure observed: "query"')
  })

  it('generates importable rules whose threshold ordering is conservative', async () => {
    const file = join(dir, 'nominee.policy.mjs')
    writeFileSync(file, generateStarterPolicy(report()))
    const loaded = await import(`${pathToFileURL(file).href}?t=${Date.now()}`)
    const nominee = new Nominee({ policy: loaded.default })

    await expect(
      nominee.check({ tool: 'refund.issue', input: { amount: 25 }, user: 'alice' }),
    ).resolves.toMatchObject({ effect: 'allow' })
    await expect(
      nominee.check({ tool: 'refund.issue', input: { amount: 4 }, user: 'alice' }),
    ).resolves.toMatchObject({ effect: 'ask' })
    await expect(
      nominee.check({ tool: 'refund.issue', input: { amount: 26 }, user: 'alice' }),
    ).resolves.toMatchObject({ effect: 'ask' })
    await expect(
      nominee.check({ tool: 'refund.issue', input: { amount: '25' }, user: 'alice' }),
    ).resolves.toMatchObject({ effect: 'ask' })
    await expect(
      nominee.check({ tool: 'customers.delete', input: {}, user: 'alice' }),
    ).resolves.toMatchObject({ effect: 'deny' })
  })

  it('emits TypeScript that passes strict semantic checking', () => {
    const file = join(dir, 'nominee.policy.ts')
    writeFileSync(file, generateStarterPolicy(report()))
    const program = ts.createProgram([file], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    })
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))

    expect(diagnostics).toEqual([])
  })

  it('binds literal wildcard characters to the exact observed tool name', async () => {
    const wildcard = report()
    wildcard.availableTools = ['orders.*.read']
    wildcard.tools = [
      {
        ...wildcard.tools[0]!,
        tool: 'orders.*.read',
      },
    ]
    const file = join(dir, 'wildcard-policy.mjs')
    writeFileSync(file, generateStarterPolicy(wildcard))
    const loaded = await import(`${pathToFileURL(file).href}?t=${Date.now()}`)
    const nominee = new Nominee({ policy: loaded.default })

    await expect(
      nominee.check({ tool: 'orders.*.read', input: {}, user: 'alice' }),
    ).resolves.toMatchObject({ effect: 'allow' })
    await expect(
      nominee.check({ tool: 'orders.private.read', input: {}, user: 'alice' }),
    ).resolves.toMatchObject({ effect: 'deny' })
  })

  it('passes nominee check using the embedded real tool inventory', async () => {
    const file = join(dir, 'nominee.policy.mjs')
    writeFileSync(file, generateStarterPolicy(report()))

    await expect(runCheck(file)).resolves.toEqual({ code: 0 })
    expect(logs.join('\n')).toContain('All rules reachable.')
  })

  it('accepts legacy reports but says unused tools cannot be inferred', () => {
    const legacy = { ...report(), version: 1, availableTools: undefined }
    const parsed = parseObservationReport(legacy)
    expect(generateStarterPolicy(parsed)).toContain(
      'legacy report did not include a tool inventory',
    )
  })

  it('unions called tools into an empty version-2 inventory', async () => {
    const direct = { ...report(), availableTools: [] }
    const file = join(dir, 'direct-policy.mjs')
    writeFileSync(file, generateStarterPolicy(parseObservationReport(direct)))

    await expect(runCheck(file)).resolves.toEqual({ code: 0 })
  })

  it('does not infer unused authority from truncated tool details', () => {
    const truncated = parseObservationReport({
      ...report(),
      untrackedTools: 1,
      availableTools: [...report().availableTools, 'called.but.undetailed'],
    })
    const source = generateStarterPolicy(truncated)

    expect(source).toContain('truncated tool details or inventory')
    expect(source).not.toContain('deny("customers.delete")')
    expect(source).not.toContain('deny("called.but.undetailed")')
  })

  it('refuses to invent a policy without tool evidence', () => {
    const empty = parseObservationReport({
      ...report(),
      totals: { calls: 0, tools: 0, allow: 0, ask: 0, deny: 0 },
      availableTools: [],
      tools: [],
    })

    expect(() => generateStarterPolicy(empty)).toThrow(/no tool traffic or callable-tool inventory/)
  })

  it('escapes hostile labels instead of letting them inject code or comments', () => {
    const hostile = report()
    hostile.availableTools = [...hostile.availableTools, 'evil\n// allow("*")']
    hostile.tools[1]?.arguments.push({
      name: 'line\n// deny("*")',
      types: ['string'],
      present: 1,
      unbounded: true,
    })
    hostile.tools[1]?.unboundedArguments.push('line\n// deny("*")')

    const source = generateStarterPolicy(hostile)
    expect(source).toContain('"evil\\n// allow(\\"*\\")"')
    expect(source).toContain('"line\\n// deny(\\"*\\")"')
    expect(source).not.toContain('\n// allow("*")')
  })

  it('writes exclusively and refuses an accidental overwrite', () => {
    const input = join(dir, 'observations.json')
    const out = join(dir, 'nominee.policy.ts')
    writeFileSync(input, JSON.stringify(report()))

    expect(runGeneratePolicy(input, out)).toMatchObject({ code: 0, path: out })
    const first = readFileSync(out, 'utf8')
    expect(runGeneratePolicy(input, out)).toEqual({ code: 1 })
    expect(readFileSync(out, 'utf8')).toBe(first)
    expect(logs.join('\n')).toContain('refusing to overwrite')
  })

  it('rejects malformed and future report schemas', () => {
    expect(() => parseObservationReport({ ...report(), version: 99 })).toThrow(
      /schema version 1 or 2/,
    )
    expect(() =>
      parseObservationReport({
        ...report(),
        tools: [{ ...report().tools[0], calls: -1 }],
      }),
    ).toThrow(/invalid tool observation/)
  })
})
