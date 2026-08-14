import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Nominee, type ObservationReportV2, allow, ask } from 'nominee'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConsoleBridge } from '../src/console-client.js'
import { type ConsoleServerHandle, startConsole } from '../src/console.js'

const TOKEN = 'a'.repeat(64)

function observation(policyConfigured = false): ObservationReportV2 {
  return {
    mode: 'observe',
    version: 2,
    generatedAt: Date.now(),
    window: { from: Date.now() - 1_000, to: Date.now() },
    totals: {
      calls: 4,
      tools: 2,
      allow: policyConfigured ? 2 : 4,
      ask: policyConfigured ? 1 : 0,
      deny: policyConfigured ? 1 : 0,
    },
    policyConfigured,
    availableTools: ['orders.read', 'refund.issue', 'customers.export'],
    tools: [
      {
        tool: 'orders.read',
        calls: 1,
        firstSeenAt: Date.now() - 1_000,
        lastSeenAt: Date.now(),
        users: 1,
        kind: 'read',
        verdicts: { allow: 1, ask: 0, deny: 0 },
        baseline: 'allow',
        arguments: [],
        unboundedArguments: [],
      },
      {
        tool: 'refund.issue',
        calls: 3,
        firstSeenAt: Date.now() - 1_000,
        lastSeenAt: Date.now(),
        users: 1,
        kind: 'mutate',
        verdicts: { allow: policyConfigured ? 1 : 3, ask: policyConfigured ? 1 : 0, deny: 0 },
        baseline: 'ask',
        arguments: [
          {
            name: 'amount',
            types: ['number'],
            present: 3,
            range: { min: 5, max: 200, median: 25 },
            unbounded: true,
          },
        ],
        unboundedArguments: ['amount'],
      },
    ],
  }
}

interface UiSession {
  cookie: string
  csrf: string
}

async function authenticate(handle: ConsoleServerHandle): Promise<UiSession> {
  const bootstrap = await fetch(handle.bootstrapUrl, { redirect: 'manual' })
  expect(bootstrap.status).toBe(302)
  const cookie = bootstrap.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('missing UI cookie')
  const response = await fetch(`${handle.origin}/api/state`, { headers: { cookie } })
  const state = (await response.json()) as { csrf: string }
  return { cookie, csrf: state.csrf }
}

async function getState(handle: ConsoleServerHandle, session: UiSession): Promise<any> {
  const response = await fetch(`${handle.origin}/api/state`, {
    headers: { cookie: session.cookie },
  })
  expect(response.status).toBe(200)
  return response.json()
}

async function uiPost(
  handle: ConsoleServerHandle,
  session: UiSession,
  path: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${handle.origin}${path}`, {
    method: 'POST',
    headers: {
      cookie: session.cookie,
      origin: handle.origin,
      'content-type': 'application/json',
      'x-nominee-csrf': session.csrf,
    },
    body: JSON.stringify(body),
  })
}

async function waitFor(read: () => Promise<any>, predicate: (value: any) => boolean): Promise<any> {
  const until = Date.now() + 3_000
  while (Date.now() < until) {
    const value = await read()
    if (predicate(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('condition did not become true')
}

describe('nominee console', () => {
  let handle: ConsoleServerHandle | undefined
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nominee-console-'))
  })

  afterEach(async () => {
    await handle?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function start(options: Parameters<typeof startConsole>[0] = {}) {
    handle = await startConsole({ port: 0, token: TOKEN, open: false, ...options })
    return handle
  }

  it('binds to loopback and requires separate producer and UI authentication', async () => {
    const server = await start()
    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:/)

    expect((await fetch(`${server.origin}/api/state`)).status).toBe(401)
    expect(
      (
        await fetch(`${server.origin}/api/observations`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ stream: 'agent', report: observation() }),
        })
      ).status,
    ).toBe(401)

    const session = await authenticate(server)
    expect((await fetch(server.bootstrapUrl, { redirect: 'manual' })).status).toBe(401)
    const state = await getState(server, session)
    expect(state.headlines.calls).toBe(0)
    await expect(
      startConsole({ host: '0.0.0.0' as '127.0.0.1', port: 0, open: false }),
    ).rejects.toThrow(/non-loopback/)
  })

  it('renders honest headlines and writes a policy only after same-origin CSRF validation', async () => {
    const out = join(dir, 'nominee.policy.ts')
    const server = await start({ policyOut: out })
    const session = await authenticate(server)
    const bridge = createConsoleBridge({ url: server.origin, token: TOKEN, stream: 'agent' })
    await bridge.publishObservations(observation())

    let state = await getState(server, session)
    expect(state.headlines).toMatchObject({ calls: 4, mutatingCalls: 3, unboundedTools: 1 })
    expect(state.headlines.denies).toEqual({
      value: null,
      note: 'not measured — no policy was configured',
    })

    const noCsrf = await fetch(`${server.origin}/api/policy`, {
      method: 'POST',
      headers: {
        cookie: session.cookie,
        origin: server.origin,
        'content-type': 'application/json',
      },
      body: '{}',
    })
    expect(noCsrf.status).toBe(403)

    expect((await uiPost(server, session, '/api/policy', {})).status).toBe(201)
    expect(readFileSync(out, 'utf8')).toContain('deny("customers.export")')
    expect((await uiPost(server, session, '/api/policy', {})).status).toBe(409)

    await bridge.publishObservations(observation(true))
    state = await getState(server, session)
    expect(state.headlines.denies.value).toBe(1)
    expect(state.headlines.denies.note).toContain('none enforced')
  })

  it('marks mutation and unbounded summaries as lower bounds when tool details are incomplete', async () => {
    const report = observation()
    report.untrackedTools = 1
    report.totals.tools = 3
    const server = await start({ initialReport: report })
    const session = await authenticate(server)
    const state = await getState(server, session)

    expect(state.headlines).toMatchObject({
      mutatingCalls: 3,
      unboundedTools: 1,
      toolCount: 3,
      toolDetailsIncomplete: true,
    })
  })

  it('approves once, resumes the real tool, and rejects a replay', async () => {
    const server = await start()
    const session = await authenticate(server)
    const errors: Error[] = []
    const bridge = createConsoleBridge({
      url: server.origin,
      token: TOKEN,
      stream: 'approval-test',
      onError: (error) => errors.push(error),
    })
    let executions = 0
    const nominee = new Nominee({
      policy: { rules: [ask('refund.issue')], fallback: 'deny' },
      onApprovalRequest: bridge.onApprovalRequest,
      receipts: { onReceipt: bridge.onReceipt, delivery: 'strict' },
    })
    const tools = nominee.guard(
      {
        'refund.issue': async ({ amount }: { amount: number }) => {
          executions++
          return `refunded ${amount}`
        },
      },
      { user: 'alice' },
    )

    const call = tools['refund.issue']({ amount: 200 })
    const waiting = await waitFor(
      () => getState(server, session),
      (state) => state.approvals.length === 1,
    )
    const id = waiting.approvals[0].id as string
    expect(waiting.approvals[0].detail).toEqual({ amount: 200 })

    expect(
      (
        await uiPost(server, session, `/api/approvals/${encodeURIComponent(id)}/decision`, {
          decision: 'approved',
        })
      ).status,
    ).toBe(200)
    await expect(call).resolves.toBe('refunded 200')
    expect(executions).toBe(1)
    expect(errors).toEqual([])

    expect(
      (
        await uiPost(server, session, `/api/approvals/${encodeURIComponent(id)}/decision`, {
          decision: 'approved',
        })
      ).status,
    ).toBe(409)

    const state = await waitFor(
      () => getState(server, session),
      (value) => value.chains[0]?.receipts.length > 0,
    )
    expect(state.chains[0].verification.kind).toBe('valid-unsigned')
    expect(state.activity.some((event: { detail: string }) => event.detail.includes('ask'))).toBe(
      true,
    )
    expect(JSON.stringify(state.chains[0])).not.toContain('alice')
    expect(JSON.stringify(state.chains[0])).not.toContain('amount')
  })

  it('denies through the UI without executing the tool', async () => {
    const server = await start()
    const session = await authenticate(server)
    const bridge = createConsoleBridge({ url: server.origin, token: TOKEN, stream: 'deny-test' })
    let executed = false
    const nominee = new Nominee({
      policy: [ask('customers.delete')],
      onApprovalRequest: bridge.onApprovalRequest,
    })
    const tools = nominee.guard(
      {
        'customers.delete': async (_input: { customerId: string }) => {
          executed = true
        },
      },
      { user: 'alice' },
    )

    const call = tools['customers.delete']({ customerId: 'cus_42' })
    const denied = expect(call).rejects.toThrow(/denied/)
    const waiting = await waitFor(
      () => getState(server, session),
      (state) => state.approvals.length === 1,
    )
    const id = waiting.approvals[0].id as string
    await uiPost(server, session, `/api/approvals/${encodeURIComponent(id)}/decision`, {
      decision: 'denied',
    })

    await denied
    expect(executed).toBe(false)
  })

  it('fails closed when the console is unavailable', async () => {
    const errors: Error[] = []
    const bridge = createConsoleBridge({
      url: 'http://127.0.0.1:9',
      token: TOKEN,
      onError: (error) => errors.push(error),
    })
    let executed = false
    const nominee = new Nominee({
      policy: [ask('refund.issue')],
      onApprovalRequest: bridge.onApprovalRequest,
    })

    await expect(
      nominee
        .guard(
          {
            'refund.issue': async (_input: { amount: number }) => {
              executed = true
            },
          },
          { user: 'alice' },
        )
        ['refund.issue']({ amount: 10 }),
    ).rejects.toThrow(/denied/)
    expect(executed).toBe(false)
    expect(errors[0]?.message).toContain('console is unavailable')
  })

  it('distinguishes unsigned, HMAC, damaged, and partial receipt evidence', async () => {
    const signedNominee = new Nominee({
      policy: { rules: [allow('orders.read')], fallback: 'deny' },
      receipts: { key: 'receipt-secret' },
    })
    await signedNominee.run(
      { tool: 'orders.read', input: { orderId: 'ord_42' }, user: 'alice' },
      () => 'order',
    )
    const signed = [...signedNominee.receipts]

    let server = await start({ initialReceipts: signed })
    let session = await authenticate(server)
    let state = await getState(server, session)
    expect(state.chains[0].verification.kind).toBe('key-required')
    await server.close()

    server = await start({ initialReceipts: signed, receiptKey: 'receipt-secret' })
    session = await authenticate(server)
    state = await getState(server, session)
    expect(state.chains[0].verification.kind).toBe('valid-hmac')
    await server.close()

    const damaged = signed.map((receipt, index) =>
      index === 0 ? { ...receipt, reason: 'changed after sealing' } : receipt,
    )
    server = await start({ initialReceipts: damaged, receiptKey: 'receipt-secret' })
    session = await authenticate(server)
    state = await getState(server, session)
    expect(state.chains[0].verification.kind).toBe('invalid')
    await server.close()

    const unsignedNominee = new Nominee({
      policy: { rules: [allow('orders.read')], fallback: 'deny' },
    })
    await unsignedNominee.run(
      { tool: 'orders.read', input: { orderId: 'ord_42' }, user: 'alice' },
      () => 'order',
    )
    server = await start({ initialReceipts: [...unsignedNominee.receipts].slice(1) })
    session = await authenticate(server)
    state = await getState(server, session)
    expect(state.chains[0].verification.kind).toBe('segment-valid')
    expect(state.chains[0].verification.detail).toContain('omitted prefix')
  })

  it('caps producer request bodies', async () => {
    const server = await start()
    const response = await fetch(`${server.origin}/api/observations`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ stream: 'agent', padding: 'x'.repeat(300_000) }),
    })
    expect(response.status).toBe(413)
  })

  it('accepts an IPv6 loopback bridge URL', () => {
    expect(() =>
      createConsoleBridge({
        url: 'http://[::1]:4317',
        token: TOKEN,
        fetch: async () => new Response(null, { status: 202 }),
      }),
    ).not.toThrow()
  })

  it('coalesces observation snapshots while one publish is in flight', async () => {
    let calls = 0
    let release = () => {}
    const first = new Promise<void>((resolve) => {
      release = resolve
    })
    const bridge = createConsoleBridge({
      token: TOKEN,
      fetch: async () => {
        calls++
        if (calls === 1) await first
        return new Response(null, { status: 202 })
      },
    })

    const follower = bridge.followObservations(() => observation(), 100)
    await new Promise((resolve) => setTimeout(resolve, 260))
    expect(calls).toBe(1)
    release()
    await waitFor(
      async () => calls,
      (count) => count >= 2,
    )
    await follower.stop()
    expect(calls).toBe(2)
  })
})
