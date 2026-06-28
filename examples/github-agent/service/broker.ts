// merge-access broker — a stand-in for the privileged-action gateway many orgs
// put in front of sensitive operations. Merging a protected branch is gated:
// callers must first request a short-lived, just-in-time access token, then
// present it to actually merge. The broker is the ONLY thing holding the real
// GitHub credential — agents only ever see a short-lived access token.
//
// Run it alongside the agent:  pnpm broker
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROKER_PORT, BROKER_URL, JIT_TTL_MS } from '../lib/constants.js'
import { getPR, mergePR } from '../lib/github.js'

// The broker holds the privileged GitHub credential (from .env.local).
const HERE = dirname(fileURLToPath(import.meta.url))
function githubToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  const envPath = join(HERE, '..', '.env.local')
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, 'utf8').match(/^GITHUB_TOKEN=(.*)$/m)
    if (m?.[1]) return m[1]
  }
  throw new Error('broker: GITHUB_TOKEN not set — run `pnpm setup`')
}
const GITHUB_TOKEN = githubToken()

// Issued just-in-time access tokens → their expiry.
const access = new Map<string, number>()
const issue = () => {
  const token = randomUUID()
  const expiresAt = Date.now() + JIT_TTL_MS
  access.set(token, expiresAt)
  return { token, expiresAt }
}
const isValid = (token: unknown): boolean => {
  const exp = typeof token === 'string' ? access.get(token) : undefined
  return exp !== undefined && Date.now() < exp
}

const readBody = (req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve({})
      }
    })
  })

createServer(async (req, res) => {
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const url = new URL(req.url ?? '/', BROKER_URL)

  // Request just-in-time merge access (a short-lived token).
  if (req.method === 'POST' && url.pathname === '/access') {
    return json(200, issue())
  }

  const body = await readBody(req)
  if (!isValid(body.token)) {
    // The real, non-simulated rejection: the access token has lapsed.
    return json(403, { error: 'access_expired', message: 'merge-access token expired or unknown' })
  }
  const ref = { owner: String(body.owner), repo: String(body.repo), number: Number(body.number) }

  try {
    if (req.method === 'POST' && url.pathname === '/pr') {
      return json(200, await getPR({ ...ref, token: GITHUB_TOKEN }))
    }
    if (req.method === 'POST' && url.pathname === '/merge') {
      return json(200, await mergePR({ ...ref, token: GITHUB_TOKEN }))
    }
  } catch (e) {
    return json(502, { error: 'github_error', message: e instanceof Error ? e.message : String(e) })
  }
  return json(404, { error: 'not_found' })
}).listen(BROKER_PORT, () => {
  console.log(`merge-access broker listening on ${BROKER_URL}`)
  console.log(`issuing just-in-time tokens with a ${JIT_TTL_MS}ms lifetime`)
})
