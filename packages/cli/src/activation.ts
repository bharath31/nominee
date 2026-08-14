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
  events: Partial<Record<ReportingEvent, EventState>>
}

interface EventState {
  prompted: boolean
  reported: boolean
}

export type ReportingEvent = 'cli_proof_completed' | 'developer_activated'

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
    const stored = JSON.parse(await readFile(file, 'utf8')) as Partial<ActivationState> & {
      // Version 2.3.0 stored one shared choice for the CLI proof. Preserve it
      // as the trial choice without suppressing the later, real activation.
      prompted?: boolean
      reported?: boolean
    }
    const storedEvents = stored.events && typeof stored.events === 'object' ? stored.events : {}
    return {
      installationId: validInstallationId(stored.installationId)
        ? stored.installationId
        : randomUUID(),
      events: {
        cli_proof_completed: normalizeEventState(
          storedEvents.cli_proof_completed ?? {
            prompted: stored.prompted === true,
            reported: stored.reported === true,
          },
        ),
        ...(storedEvents.developer_activated
          ? { developer_activated: normalizeEventState(storedEvents.developer_activated) }
          : {}),
      },
    }
  } catch {
    return { installationId: randomUUID(), events: {} }
  }
}

function normalizeEventState(value: unknown): EventState {
  const state = value && typeof value === 'object' ? (value as Partial<EventState>) : {}
  return { prompted: state.prompted === true, reported: state.reported === true }
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

async function offerReport(
  event: ReportingEvent,
  label: 'CLI trial' | 'verified developer activation',
  options: ActivationOptions,
): Promise<void> {
  const env = options.env ?? process.env
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  if (
    trackingDisabled(env) ||
    !('isTTY' in input) ||
    !input.isTTY ||
    !('isTTY' in output) ||
    output.isTTY !== true
  ) {
    return
  }

  const file = options.stateFile ?? STATE_FILE
  const timeoutMs = options.timeoutMs ?? SEND_TIMEOUT_MS
  const state = await loadState(file)
  const eventState = normalizeEventState(state.events[event])
  if (eventState.prompted || eventState.reported) return

  const payload = {
    event,
    installationId: state.installationId,
    cliVersion: packageMetadata.version,
  }
  output.write(`\nShare this ${label} with nominee? (optional)\n`)
  output.write(`This sends exactly: ${JSON.stringify(payload)}\n`)
  output.write('Set DO_NOT_TRACK=1 to disable this prompt.\n')

  const prompt = createInterface({ input, output })
  let answer: string
  try {
    answer = await prompt.question('Send? [y/N] ')
  } finally {
    prompt.close()
  }
  eventState.prompted = true
  state.events[event] = eventState

  try {
    // Persist the one-time choice before any network request. If local state
    // is unwritable, sending would risk reporting the same install repeatedly.
    await saveState(file, state)
  } catch {
    output.write('Report was not sent because the local choice could not be saved.\n')
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
      eventState.reported = true
      output.write(`${label === 'CLI trial' ? 'Trial' : 'Activation'} shared. Thank you.\n`)
    } catch {
      output.write('Report was not sent.\n')
    }
  }
  // `prompted: true` is already durable, so a failed acknowledgement write
  // cannot cause a duplicate report on the next run.
  if (eventState.reported) await saveState(file, state).catch(() => undefined)
}

/** Offers a one-time, disclosed trial report after the bundled CLI proof succeeds. */
export async function offerActivationReport(options: ActivationOptions = {}): Promise<void> {
  await offerReport('cli_proof_completed', 'CLI trial', options)
}

/** Offers a separate report only after local artifacts prove a real governed execution. */
export async function offerDeveloperActivationReport(
  options: ActivationOptions = {},
): Promise<void> {
  await offerReport('developer_activated', 'verified developer activation', options)
}
