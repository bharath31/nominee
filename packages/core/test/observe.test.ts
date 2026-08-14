import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CapabilityInvalidError,
  MemoryActionStore,
  Nominee,
  ObservationCollector,
  allow,
  ask,
  classifyTool,
  deny,
  formatObservations,
  verifyReceipts,
} from '../src/index.js'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

/** Everything console.warn was handed this test, as one string. */
function warnings(): string {
  return warn.mock.calls.map((args: unknown[]) => String(args[0])).join('\n')
}

describe('observe mode', () => {
  it('wraps tools with no policy at all and blocks nothing', async () => {
    const n = new Nominee({ mode: 'observe' })
    const calls: string[] = []
    const tools = n.observe({
      'orders.read': async (_input: unknown) => calls.push('orders.read'),
      'refund.issue': async (_input: { amount: number }) => calls.push('refund.issue'),
    })

    await tools['orders.read']({ id: 'o-1' })
    await tools['refund.issue']({ amount: 2000 })

    expect(calls).toEqual(['orders.read', 'refund.issue'])
    expect(n.observations().totals.calls).toBe(2)
  })

  it('records deny verdicts without enforcing them', async () => {
    const n = new Nominee({
      mode: 'observe',
      policy: { rules: [deny('customers.export')], fallback: 'deny' },
    })
    let ran = false
    const tools = n.observe({
      'customers.export': async (_input: unknown) => {
        ran = true
      },
    })

    await tools['customers.export']({ all: true })

    expect(ran).toBe(true)
    const decision = n.receipts.find((r) => r.type === 'policy.decision')
    expect(decision?.effect).toBe('deny')
    expect(decision?.enforcement).toBe('observe')
    expect(decision?.reason).toContain('enforcement is off')
    expect(n.observations().totals.deny).toBe(1)
  })

  it('preserves the real policy verdict on authorizations and action records', async () => {
    const n = new Nominee({ mode: 'observe', policy: [deny('customers.export')] })

    const authorization = await n.authorize({
      tool: 'customers.export',
      input: { all: true },
      user: 'alice',
    })
    expect(authorization.effect).toBe('allow')
    expect(authorization.decision.effect).toBe('deny')
    expect(n.observations().totals.calls).toBe(0)

    let executedAction: { policyEffect?: string; enforcement?: string } | undefined
    await n.run({ tool: 'customers.export', input: { all: true }, user: 'alice' }, ({ action }) => {
      executedAction = action
    })

    expect(executedAction).toMatchObject({ policyEffect: 'deny', enforcement: 'observe' })
    expect(n.observations().totals).toMatchObject({ calls: 1, deny: 1 })
  })

  it('counts execution, not planning', async () => {
    const n = new Nominee({ mode: 'observe', policy: [ask('refund.issue')] })
    const input = { amount: 25 }

    const prepared = await n.prepareAction({ tool: 'refund.issue', input, user: 'alice' })
    expect(prepared.status).toBe('ready')
    expect(n.observations().totals.calls).toBe(0)

    if (prepared.status !== 'ready') throw new Error('expected a ready action')
    await n.executeCapability(prepared.capability, input, () => 'done')
    expect(n.observations().totals.calls).toBe(1)
  })

  it('never pauses on ask rules', async () => {
    const n = new Nominee({ mode: 'observe', policy: [ask('refund.issue')] })
    // No onApprovalRequest is configured: in enforcing mode this call would
    // wait forever. Observe mode must return.
    const tools = n.observe({ 'refund.issue': async (_input: unknown) => 'refunded' })

    await expect(tools['refund.issue']({ amount: 20 })).resolves.toBe('refunded')
    expect(n.observations().totals.ask).toBe(1)
    expect(warnings()).not.toContain('approvals will wait forever')
  })

  it('rejects capabilities presented to an instance in the other enforcement mode', async () => {
    const store = new MemoryActionStore()
    const observing = new Nominee({
      mode: 'observe',
      policy: [deny('customers.export')],
      actionStore: store,
    })
    const prepared = await observing.prepareAction({
      tool: 'customers.export',
      input: { all: true },
      user: 'alice',
    })
    if (prepared.status !== 'ready') throw new Error('expected a ready action')

    const enforcing = new Nominee({ policy: [allow('customers.export')], actionStore: store })
    await expect(
      enforcing.executeCapability(prepared.capability, { all: true }, () => 'ran'),
    ).rejects.toThrow(CapabilityInvalidError)
  })

  it('produces receipts in the same hash chain format as enforcing mode', async () => {
    const observing = new Nominee({ mode: 'observe', policy: [allow('orders.read')] })
    const enforcing = new Nominee({ policy: [allow('orders.read')] })

    const read = async (_input: unknown) => 1
    await observing.observe({ 'orders.read': read })['orders.read']({ id: 1 })
    await enforcing.guard({ 'orders.read': read }, { user: 'alice' })['orders.read']({ id: 1 })

    expect(observing.receipts.map((r) => r.type)).toEqual(enforcing.receipts.map((r) => r.type))
    expect(observing.verifyReceipts().ok).toBe(true)
    expect(verifyReceipts([...observing.receipts]).ok).toBe(true)
    // Every receipt from an observe session says so.
    expect(observing.receipts.every((r) => r.enforcement === 'observe')).toBe(true)
    expect(enforcing.receipts.every((r) => r.enforcement === undefined)).toBe(true)
  })

  it('refuses to combine with production: true', () => {
    expect(
      () =>
        new Nominee({
          mode: 'observe',
          production: true,
          policy: { rules: [allow('a')], fallback: 'deny' },
        }),
    ).toThrow(/cannot be combined with production: true/)
  })

  it('announces on startup that enforcement is off, even under NODE_ENV=production', () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      new Nominee({ mode: 'observe' })
    } finally {
      process.env.NODE_ENV = previous
    }
    const notice = warnings()
    expect(notice).toContain('OBSERVE MODE')
    expect(notice).toContain('ENFORCEMENT IS OFF')
    expect(notice).toContain('NODE_ENV=production')
  })

  it('does not announce anything in enforcing mode', () => {
    new Nominee({ policy: [allow('a')] })
    expect(warnings()).not.toContain('OBSERVE MODE')
  })

  it('observe() is unavailable on an enforcing instance', () => {
    const n = new Nominee({ policy: [allow('a')] })
    expect(() => n.observe({ a: async (_input: unknown) => 1 })).toThrow(/requires mode: 'observe'/)
  })

  it('sub-agents inherit the mode and share one report', async () => {
    const n = new Nominee({ mode: 'observe' })
    const sub = n.delegate('researcher', { policy: [deny('email.send')] })
    expect(sub.mode).toBe('observe')

    let ran = false
    const send = async (_input: unknown) => {
      ran = true
    }
    await sub.observe({ 'email.send': send })['email.send']({ to: 'a@b.c' })

    expect(ran).toBe(true)
    expect(n.observations().totals.calls).toBe(1)
    expect(n.observations().policyConfigured).toBe(true)
  })

  it('an enforcing parent produces enforcing sub-agents', async () => {
    const n = new Nominee({ policy: [deny('email.send')] })
    const sub = n.delegate('researcher')
    expect(sub.mode).toBe('enforce')
    await expect(sub.run({ tool: 'email.send', user: 'alice' }, async () => 1)).rejects.toThrow()
  })

  it('budget escalation is recorded, not enforced', async () => {
    const n = new Nominee({ mode: 'observe', policy: [allow('search.web', { max: 1 })] })
    const tools = n.observe({ 'search.web': async (_input: unknown) => 'results' })

    await tools['search.web']({ q: 'a' })
    await expect(tools['search.web']({ q: 'b' })).resolves.toBe('results')

    const observations = n.observations()
    expect(observations.totals.allow).toBe(1)
    expect(observations.totals.ask).toBe(1)
  })
})

describe('observation report', () => {
  it('classifies tools, counts calls, and describes arguments', async () => {
    const n = new Nominee({ mode: 'observe' })
    const tools = n.observe({
      'orders.read': async (_input: { id: string }) => 'order',
      'refund.issue': async (_input: { amount: number; currency: string }) => 'ok',
    })

    await tools['orders.read']({ id: 'o-1' })
    for (const amount of [5, 25, 180]) {
      await tools['refund.issue']({ amount, currency: 'usd' })
    }

    const report = n.observations()
    expect(report.mode).toBe('observe')
    expect(report.version).toBe(2)
    expect(report.totals).toMatchObject({ calls: 4, tools: 2 })
    expect(report.availableTools).toEqual(['orders.read', 'refund.issue'])
    expect(report.policyConfigured).toBe(false)

    const refund = report.tools.find((tool) => tool.tool === 'refund.issue')
    expect(refund).toMatchObject({ calls: 3, kind: 'mutate', baseline: 'ask', users: 1 })

    const amount = refund?.arguments.find((arg) => arg.name === 'amount')
    expect(amount?.range).toEqual({ min: 5, max: 180, median: 25 })
    expect(amount?.unbounded).toBe(true)
    expect(refund?.unboundedArguments).toEqual(['amount'])

    // A repeated short string is an enumerable set, not an unbounded argument.
    const currency = refund?.arguments.find((arg) => arg.name === 'currency')
    expect(currency).toMatchObject({ unbounded: false, distinctValues: 1 })
    expect(currency).not.toHaveProperty('values')

    const orders = report.tools.find((tool) => tool.tool === 'orders.read')
    expect(orders).toMatchObject({ kind: 'read', baseline: 'allow' })
  })

  it('keeps a bounded inventory of tools that were available but never called', async () => {
    const n = new Nominee({ mode: 'observe' })
    const tools = n.observe({
      'orders.read': async () => 'order',
      'customers.export': async () => 'rows',
      metadata: { label: 'not a callable tool' },
    })

    await tools['orders.read']()

    const report = n.observations()
    expect(report.availableTools).toEqual(['customers.export', 'orders.read'])
    expect(report.tools.map((tool) => tool.tool)).toEqual(['orders.read'])
    expect(report.totals.tools).toBe(1)
  })

  it('is empty and JSON-serializable outside observe mode', () => {
    const report = new Nominee({ policy: [allow('a')] }).observations()
    expect(report.totals.calls).toBe(0)
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })

  it('classifyTool reads names, and admits when it cannot tell', () => {
    expect(classifyTool('orders.read')).toBe('read')
    expect(classifyTool('searchEmail')).toBe('read')
    expect(classifyTool('refund.issue')).toBe('mutate')
    expect(classifyTool('github.merge_pr')).toBe('mutate')
    expect(classifyTool('customers.export')).toBe('unknown')
  })

  it('formats a report that leads with enforcement being off', async () => {
    const n = new Nominee({ mode: 'observe', policy: [deny('customers.export')] })
    const exportAll = async (_input: unknown) => 'rows'
    await n.observe({ 'customers.export': exportAll })['customers.export']({ all: true })

    const text = formatObservations(n.observations())
    expect(text).toContain('ENFORCEMENT WAS OFF')
    expect(text).toContain('customers.export')
    expect(text).toContain('1 denied')
    expect(text).toContain('not a judgement about what it')
  })

  it('never exposes raw strings or user IDs in reports or formatted output', () => {
    const collector = new ObservationCollector()
    const shortSecret = 'sk-live-short-secret'
    const longSecret = `sk-live-${'x'.repeat(100)}`

    collector.record({
      tool: 'credentials.send',
      input: { shortSecret, longSecret },
      user: 'alice@example.com',
      effect: 'ask',
    })

    const report = collector.report()
    const serialized = JSON.stringify(report)
    const formatted = formatObservations(report)
    expect(serialized).not.toContain(shortSecret)
    expect(serialized).not.toContain(longSecret)
    expect(serialized).not.toContain('alice@example.com')
    expect(formatted).not.toContain(shortSecret)
    expect(formatted).not.toContain(longSecret)
    expect(report.tools[0]?.arguments.find((arg) => arg.name === 'shortSecret')).toMatchObject({
      distinctValues: 1,
      unbounded: false,
    })
    expect(report.tools[0]?.arguments.find((arg) => arg.name === 'longSecret')).toMatchObject({
      unbounded: true,
    })
  })

  it('keeps exact numeric extrema after the median sample cap', () => {
    const collector = new ObservationCollector()
    for (let amount = 0; amount < 1000; amount++) {
      collector.record({ tool: 'refund.issue', input: { amount }, user: 'alice', effect: 'allow' })
    }
    collector.record({
      tool: 'refund.issue',
      input: { amount: 1_000_000 },
      user: 'alice',
      effect: 'allow',
    })
    collector.record({
      tool: 'refund.issue',
      input: { amount: -10 },
      user: 'alice',
      effect: 'allow',
    })

    const amount = collector.report().tools[0]?.arguments[0]
    expect(amount?.range).toEqual({ min: -10, max: 1_000_000, median: 499.5 })
  })

  it('treats mixed numeric inputs and root inputs as unbounded', () => {
    const collector = new ObservationCollector()
    collector.record({
      tool: 'refund.issue',
      input: { amount: 'small' },
      user: 'alice',
      effect: 'allow',
    })
    collector.record({
      tool: 'refund.issue',
      input: { amount: 5 },
      user: 'alice',
      effect: 'allow',
    })
    collector.record({ tool: 'search.run', input: ['one'], user: 'alice', effect: 'allow' })
    collector.record({ tool: 'lookup.run', input: 'needle', user: 'alice', effect: 'allow' })

    const report = collector.report()
    const amount = report.tools
      .find((tool) => tool.tool === 'refund.issue')
      ?.arguments.find((arg) => arg.name === 'amount')
    expect(amount).toMatchObject({ types: ['number', 'string'], unbounded: true })
    expect(report.tools.find((tool) => tool.tool === 'search.run')?.arguments[0]).toMatchObject({
      name: '$input',
      types: ['array'],
      unbounded: true,
    })
    expect(report.tools.find((tool) => tool.tool === 'lookup.run')?.arguments[0]).toMatchObject({
      name: '$input',
      types: ['string'],
      distinctValues: 1,
    })
  })

  it('reports bounded tool and user truncation honestly', () => {
    const collector = new ObservationCollector()
    for (let tool = 0; tool < 405; tool++) {
      collector.record({ tool: `tool.${tool}`, user: 'alice', effect: 'allow' })
    }
    for (let user = 0; user < 1001; user++) {
      collector.record({ tool: 'tool.0', user: `user-${user}`, effect: 'allow' })
    }

    const report = collector.report()
    expect(report.totals.tools).toBe(400)
    expect(report.tools).toHaveLength(200)
    expect(report.untrackedTools).toBe(200)
    expect(report.toolsTruncated).toBe(true)
    expect(formatObservations(report)).toContain('at least 400 tool(s)')
    expect(report.tools.find((tool) => tool.tool === 'tool.0')).toMatchObject({
      users: 1000,
      usersTruncated: true,
    })
  })

  it('never lets hostile input inspection break execution reporting', () => {
    const collector = new ObservationCollector()
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('do not inspect me')
        },
      },
    )

    expect(() =>
      collector.record({ tool: 'search.run', input: hostile, user: 'alice', effect: 'allow' }),
    ).not.toThrow()
    expect(collector.report().totals.calls).toBe(1)
  })
})
