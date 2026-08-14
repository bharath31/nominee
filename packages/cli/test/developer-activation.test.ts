import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { Nominee, allow, deny } from 'nominee'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDeveloperActivation } from '../src/developer-activation.js'

const dirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function terminal(answer: string) {
  const input = new PassThrough() as PassThrough & { isTTY: boolean }
  input.isTTY = true
  input.end(`${answer}\n`)
  const output = new PassThrough() as PassThrough & { isTTY: boolean }
  output.isTTY = true
  let text = ''
  output.on('data', (chunk) => {
    text += chunk.toString()
  })
  return { input, output, text: () => text }
}

describe('verified developer activation', () => {
  let dir: string
  let logs: string[]

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'nominee-developer-activation-'))
    dirs.push(dir)
    logs = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '))
    })
  })

  async function artifacts(
    options: {
      policyTool?: string
      executionTool?: string
      observe?: boolean
      emptyPolicy?: boolean
    } = {},
  ) {
    const policyTool = options.policyTool ?? 'orders.read'
    const executionTool = options.executionTool ?? 'orders.read'
    const policy = join(dir, `policy-${crypto.randomUUID()}.mjs`)
    const receipts = join(dir, `receipts-${crypto.randomUUID()}.json`)
    await writeFile(
      policy,
      options.emptyPolicy
        ? 'export default []\n'
        : `export default [{ effect: 'allow', tools: [${JSON.stringify(policyTool)}] }]\n`,
    )
    const nominee = new Nominee({
      ...(options.observe ? { mode: 'observe' as const } : {}),
      policy: [allow(executionTool), deny('*')],
      receipts: { key: 'test-key' },
    })
    await nominee.run({ tool: executionTool, user: 'alice' }, async () => 'done')
    await writeFile(receipts, JSON.stringify(nominee.receipts))
    return { policy, receipts }
  }

  it('sends only the disclosed three fields after local proof and opt-in', async () => {
    const { policy, receipts } = await artifacts()
    const io = await terminal('yes')
    const send = vi.fn(async (_payload: Record<string, string>) => undefined)

    const result = await runDeveloperActivation(policy, receipts, {
      env: { NOMINEE_RECEIPT_KEY: 'test-key' },
      stateFile: join(dir, 'state.json'),
      send,
      ...io,
    })

    expect(result.code).toBe(0)
    expect(logs.join('\n')).toContain('local activation proof')
    expect(send).toHaveBeenCalledOnce()
    const payload = send.mock.calls[0]?.[0]
    expect(payload?.event).toBe('developer_activated')
    expect(Object.keys(payload ?? {}).sort()).toEqual(['cliVersion', 'event', 'installationId'])
    expect(io.text()).toContain(`This sends exactly: ${JSON.stringify(payload)}`)
    expect(io.text()).not.toContain(await readFile(policy, 'utf8'))
  })

  it('offers real activation after the legacy CLI trial choice was already made', async () => {
    const { policy, receipts } = await artifacts()
    const stateFile = join(dir, 'state.json')
    await writeFile(
      stateFile,
      JSON.stringify({
        installationId: 'd9428888-122b-4f24-8f56-31f6c4c6d1aa',
        prompted: true,
        reported: false,
      }),
    )
    const io = await terminal('yes')
    const send = vi.fn(async (_payload: Record<string, string>) => undefined)

    const result = await runDeveloperActivation(policy, receipts, {
      env: { NOMINEE_RECEIPT_KEY: 'test-key' },
      stateFile,
      send,
      ...io,
    })

    expect(result.code).toBe(0)
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[0].event).toBe('developer_activated')
  })

  it('refuses an empty policy before offering a report', async () => {
    const { policy, receipts } = await artifacts({ emptyPolicy: true })
    const io = await terminal('yes')
    const send = vi.fn(async (_payload: Record<string, string>) => undefined)

    const result = await runDeveloperActivation(policy, receipts, {
      env: { NOMINEE_RECEIPT_KEY: 'test-key' },
      stateFile: join(dir, 'state.json'),
      send,
      ...io,
    })

    expect(result.code).toBe(1)
    expect(send).not.toHaveBeenCalled()
    expect(logs.join('\n')).toContain('policy has no rules')
  })

  it('refuses a tampered receipt chain', async () => {
    const { policy, receipts } = await artifacts()
    const chain = JSON.parse(await readFile(receipts, 'utf8')) as Array<{ reason?: string }>
    chain[0] = { ...chain[0], reason: 'tampered' }
    await writeFile(receipts, JSON.stringify(chain))

    const result = await runDeveloperActivation(policy, receipts, {
      env: { NOMINEE_RECEIPT_KEY: 'test-key' },
    })

    expect(result.code).toBe(1)
    expect(logs.join('\n')).toContain('receipt chain broken')
  })

  it('requires an execution for a tool covered by the supplied policy', async () => {
    const { policy, receipts } = await artifacts({ policyTool: 'email.read' })

    const result = await runDeveloperActivation(policy, receipts, {
      env: { NOMINEE_RECEIPT_KEY: 'test-key' },
    })

    expect(result.code).toBe(1)
    expect(logs.join('\n')).toContain('no enforced execution.succeeded matched a policy rule')
  })

  it('requires the decision receipt to name the supplied rule, not merely the same tool', async () => {
    const { policy, receipts } = await artifacts()
    await writeFile(policy, "export default [{ effect: 'deny', tools: ['orders.read'] }]\n")

    const result = await runDeveloperActivation(policy, receipts, {
      env: { NOMINEE_RECEIPT_KEY: 'test-key' },
    })

    expect(result.code).toBe(1)
    expect(logs.join('\n')).toContain('no enforced execution.succeeded matched a policy rule')
  })

  it('rejects malformed rules without throwing', async () => {
    const { policy, receipts } = await artifacts()
    await writeFile(policy, "export default [{ effect: 'allow', tools: 'orders.read' }]\n")

    const result = await runDeveloperActivation(policy, receipts, {
      env: { NOMINEE_RECEIPT_KEY: 'test-key' },
    })

    expect(result.code).toBe(1)
    expect(logs.join('\n')).toContain('policy rule #1')
  })

  it('does not treat an observe-mode execution as activation', async () => {
    const { policy, receipts } = await artifacts({ observe: true })

    const result = await runDeveloperActivation(policy, receipts, {
      env: { NOMINEE_RECEIPT_KEY: 'test-key' },
    })

    expect(result.code).toBe(1)
  })

  it('honours DO_NOT_TRACK after proving the local artifacts', async () => {
    const { policy, receipts } = await artifacts()
    const io = await terminal('yes')
    const stateFile = join(dir, 'state.json')
    const send = vi.fn(async (_payload: Record<string, string>) => undefined)

    const result = await runDeveloperActivation(policy, receipts, {
      env: { DO_NOT_TRACK: '1', NOMINEE_RECEIPT_KEY: 'test-key' },
      stateFile,
      send,
      ...io,
    })

    expect(result.code).toBe(0)
    expect(send).not.toHaveBeenCalled()
    await expect(readFile(stateFile)).rejects.toThrow()
    expect(io.text()).toBe('')
  })

  it('keeps a successful proof successful when the optional prompt fails', async () => {
    const { policy, receipts } = await artifacts()
    const input = new PassThrough() as PassThrough & { isTTY: boolean }
    input.isTTY = true
    input.end('yes\n')
    const output = {
      isTTY: true,
      write: () => {
        throw new Error('terminal unavailable')
      },
    } as unknown as NodeJS.WritableStream

    const result = await runDeveloperActivation(policy, receipts, {
      env: { NOMINEE_RECEIPT_KEY: 'test-key' },
      input,
      output,
    })

    expect(result.code).toBe(0)
  })
})
