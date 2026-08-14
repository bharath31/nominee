import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import packageMetadata from '../package.json' with { type: 'json' }
import { offerActivationReport } from '../src/activation.js'

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

describe('CLI activation reporting', () => {
  it('discloses the exact payload and sends only after opt-in', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nominee-activation-'))
    dirs.push(dir)
    const io = await terminal('yes')
    const send = vi.fn(async (_payload: Record<string, string>) => undefined)

    await offerActivationReport({
      env: { npm_package_version: '99.99.99' },
      stateFile: join(dir, 'state.json'),
      send,
      ...io,
    })

    expect(send).toHaveBeenCalledOnce()
    const payload = send.mock.calls[0]?.[0]
    expect(payload).toMatchObject({
      event: 'cli_proof_completed',
      cliVersion: packageMetadata.version,
    })
    expect(io.text()).toContain(`This sends exactly: ${JSON.stringify(payload)}`)
  })

  it('honours DO_NOT_TRACK without prompting or writing state', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nominee-activation-'))
    dirs.push(dir)
    const file = join(dir, 'state.json')
    const io = await terminal('yes')
    const send = vi.fn(async (_payload: Record<string, string>) => undefined)

    await offerActivationReport({ env: { DO_NOT_TRACK: '1' }, stateFile: file, send, ...io })

    expect(send).not.toHaveBeenCalled()
    await expect(readFile(file)).rejects.toThrow()
    expect(io.text()).toBe('')
  })

  it('does not prompt when output is redirected', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nominee-activation-'))
    dirs.push(dir)
    const file = join(dir, 'state.json')
    const input = new PassThrough() as PassThrough & { isTTY: boolean }
    input.isTTY = true
    input.end('yes\n')
    const output = new PassThrough()
    const send = vi.fn(async (_payload: Record<string, string>) => undefined)

    await offerActivationReport({ env: {}, stateFile: file, input, output, send })

    expect(send).not.toHaveBeenCalled()
    await expect(readFile(file)).rejects.toThrow()
  })

  it('asks only once after a developer declines', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nominee-activation-'))
    dirs.push(dir)
    const file = join(dir, 'state.json')
    const first = await terminal('no')
    await offerActivationReport({ env: {}, stateFile: file, ...first })

    const second = await terminal('yes')
    const send = vi.fn(async (_payload: Record<string, string>) => undefined)
    await offerActivationReport({ env: {}, stateFile: file, send, ...second })

    expect(send).not.toHaveBeenCalled()
    expect(second.text()).toBe('')
  })

  it('persists the one-time choice before sending', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nominee-activation-'))
    dirs.push(dir)
    const file = join(dir, 'state.json')
    const io = await terminal('yes')
    const send = vi.fn(async () => {
      const state = JSON.parse(await readFile(file, 'utf8')) as {
        prompted: boolean
        reported: boolean
      }
      expect(state).toMatchObject({ prompted: true, reported: false })
    })

    await offerActivationReport({ env: {}, stateFile: file, send, ...io })

    expect(send).toHaveBeenCalledOnce()
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      prompted: true,
      reported: true,
    })
  })

  it('replaces an invalid stored installation id before reporting', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nominee-activation-'))
    dirs.push(dir)
    const file = join(dir, 'state.json')
    await writeFile(
      file,
      JSON.stringify({ installationId: 'caller-controlled', prompted: false, reported: false }),
    )
    const io = await terminal('yes')
    const send = vi.fn(async (_payload: Record<string, string>) => undefined)

    await offerActivationReport({ env: {}, stateFile: file, send, ...io })

    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[0].installationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('does not send when the reporting choice cannot be persisted', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nominee-activation-'))
    dirs.push(dir)
    const io = await terminal('yes')
    const send = vi.fn(async () => undefined)

    await offerActivationReport({ env: {}, stateFile: dir, send, ...io })

    expect(send).not.toHaveBeenCalled()
    expect(io.text()).toContain('local choice could not be saved')
  })

  it('bounds a stalled optional report', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nominee-activation-'))
    dirs.push(dir)
    const io = await terminal('yes')
    const send = vi.fn(() => new Promise<void>(() => undefined))

    await offerActivationReport({
      env: {},
      stateFile: join(dir, 'state.json'),
      send,
      timeoutMs: 10,
      ...io,
    })

    expect(send).toHaveBeenCalledOnce()
    expect(io.text()).toContain('Activation was not sent.')
  })
})
