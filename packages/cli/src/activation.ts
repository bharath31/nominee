import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'

const ENDPOINT = 'https://nominee.dev/agent/funnel'
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
}

function trackingDisabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.DO_NOT_TRACK?.toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

async function loadState(file: string): Promise<ActivationState> {
  try {
    const stored = JSON.parse(await readFile(file, 'utf8')) as Partial<ActivationState>
    return {
      installationId: stored.installationId || randomUUID(),
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

/** Offers a one-time, disclosed activation report after the local proof succeeds. */
export async function offerActivationReport(options: ActivationOptions = {}): Promise<void> {
  const env = options.env ?? process.env
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  if (trackingDisabled(env) || !('isTTY' in input) || !input.isTTY) return

  const file = options.stateFile ?? STATE_FILE
  const state = await loadState(file)
  if (state.prompted || state.reported) return

  const payload = {
    event: 'cli_proof_completed',
    installationId: state.installationId,
    cliVersion: env.npm_package_version ?? 'unknown',
  }
  output.write('\nShare this activation with nominee? (optional)\n')
  output.write(`This sends exactly: ${JSON.stringify(payload)}\n`)
  output.write('Set DO_NOT_TRACK=1 to disable this prompt.\n')

  const prompt = createInterface({ input, output })
  const answer = await prompt.question('Send? [y/N] ')
  prompt.close()
  state.prompted = true

  if (/^y(es)?$/i.test(answer.trim())) {
    const send =
      options.send ??
      (async (body) => {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!response.ok) throw new Error(`report failed (${response.status})`)
      })
    try {
      await send(payload)
      state.reported = true
      output.write('Activation shared. Thank you.\n')
    } catch {
      output.write('Activation was not sent.\n')
    }
  }
  await saveState(file, state).catch(() => undefined)
}
