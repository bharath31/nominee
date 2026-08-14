import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  const output = new PassThrough()
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
      env: { npm_package_version: '2.2.3' },
      stateFile: join(dir, 'state.json'),
      send,
      ...io,
    })

    expect(send).toHaveBeenCalledOnce()
    const payload = send.mock.calls[0]?.[0]
    expect(payload).toMatchObject({ event: 'cli_proof_completed', cliVersion: '2.2.3' })
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
})
