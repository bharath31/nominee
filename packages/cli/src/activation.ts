import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import packageMetadata from '../package.json' with { type: 'json' }

const ENDPOINT = 'https://nominee.dev/agent/funnel'
const SEND_TIMEOUT_MS = 3_000
const STATE_DIR = join(homedir(), '.config', 'nominee')
const STATE_FILE = join(STATE_DIR, 'telemetry.json')

interface ActivationState {
  installationId: string
  prompted: boolean
  reported: boolean
}

export interface ActivationOptions {
  env?: NodeJS.ProcessEnv
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
  stateFile?: string
  send?: (payload: Record<string, string>) => Promise<void>
  /** Test/embedding override. The CLI default is three seconds. */
  timeoutMs?: number
}

function trackingDisabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.DO_NOT_TRACK?.toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

function validInstallationId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

async function loadState(file: string): Promise<ActivationState> {
  try {
    const stored = JSON.parse(await readFile(file, 'utf8')) as Partial<ActivationState>
    return {
      installationId: validInstallationId(stored.installationId)
        ? stored.installationId
        : randomUUID(),
      prompted: stored.prompted === true,
      reported: stored.reported === true,
    }
  } catch {
    return { installationId: randomUUID(), prompted: false, reported: false }
  }
}

async function saveState(file: string, state: ActivationState): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('activation report timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

/** Offers a one-time, disclosed activation report after the local proof succeeds. */
export async function offerActivationReport(options: ActivationOptions = {}): Promise<void> {
  const env = options.env ?? process.env
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  if (trackingDisabled(env) || !('isTTY' in input) || !input.isTTY) return

  const file = options.stateFile ?? STATE_FILE
  const timeoutMs = options.timeoutMs ?? SEND_TIMEOUT_MS
  const state = await loadState(file)
  if (state.prompted || state.reported) return

  const payload = {
    event: 'cli_proof_completed',
    installationId: state.installationId,
    cliVersion: packageMetadata.version,
  }
  output.write('\nShare this activation with nominee? (optional)\n')
  output.write(`This sends exactly: ${JSON.stringify(payload)}\n`)
  output.write('Set DO_NOT_TRACK=1 to disable this prompt.\n')

  const prompt = createInterface({ input, output })
  let answer: string
  try {
    answer = await prompt.question('Send? [y/N] ')
  } finally {
    prompt.close()
  }
  state.prompted = true

  try {
    // Persist the one-time choice before any network request. If local state
    // is unwritable, sending would risk reporting the same install repeatedly.
    await saveState(file, state)
  } catch {
    output.write('Activation was not sent because the local choice could not be saved.\n')
    return
  }

  if (/^y(es)?$/i.test(answer.trim())) {
    const send =
      options.send ??
      (async (body) => {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!response.ok) throw new Error(`report failed (${response.status})`)
      })
    try {
      await withTimeout(send(payload), timeoutMs)
      state.reported = true
      output.write('Activation shared. Thank you.\n')
    } catch {
      output.write('Activation was not sent.\n')
    }
  }
  // `prompted: true` is already durable, so a failed acknowledgement write
  // cannot cause a duplicate report on the next run.
  if (state.reported) await saveState(file, state).catch(() => undefined)
}
