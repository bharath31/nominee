import type { Redis } from '@upstash/redis'
import {
  parsePublicFunnelEvent,
  type PublicFunnelEvent,
} from '../../agent-worker/src/funnel.js'
import { redis } from './_redis.js'

export { parsePublicFunnelEvent }
export type { PublicFunnelEvent }

type FunnelRedis = Pick<Redis, 'del' | 'eval' | 'hgetall' | 'set'>

const PREFIX = 'nominee:funnel:v1'
const RETENTION_SECONDS = 400 * 24 * 60 * 60
const INSTALLATION_EVENTS = new Set(['cli_proof_completed', 'developer_activated'])
const REPORT_EVENTS = [
  'cli_proof_completed',
  'developer_activated',
  'viewed',
  'edited_policy',
  'ran_call',
  'blocked',
  'approval_requested',
  'approved',
  'session_start',
  'denied',
  'published',
  'site_npm_click',
  'site_github_click',
  'site_cli_copy',
] as const

const INCREMENT = `
redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
if ARGV[2] ~= '' then redis.call('HINCRBY', KEYS[1], ARGV[2], 1) end
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`

const DEDUPE_AND_INCREMENT = `
local accepted = redis.call('SET', KEYS[1], '1', 'NX', 'EX', ARGV[3])
if not accepted then return 0 end
redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
if ARGV[2] ~= '' then redis.call('HINCRBY', KEYS[2], ARGV[2], 1) end
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1
`

const day = (at: number) => new Date(at).toISOString().slice(0, 10)
const dailyKey = (date: string) => `${PREFIX}:daily:${date}`

async function pseudonym(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

interface TrackOptions {
  client?: FunnelRedis
  hashKey?: string
  now?: number
}

/** Persist one aggregate funnel event. Raw installation IDs never enter Redis. */
export async function trackFunnel(
  event: string,
  detail = '',
  cliVersion = '',
  options: TrackOptions = {},
): Promise<boolean> {
  const client = options.client ?? redis
  const at = options.now ?? Date.now()
  const versionField = cliVersion ? `version:${event}:${cliVersion}` : ''
  try {
    if (INSTALLATION_EVENTS.has(event)) {
      const hashKey = options.hashKey ?? process.env.FUNNEL_HASH_KEY ?? ''
      if (!hashKey || !detail) return false
      const id = await pseudonym(detail, hashKey)
      await client.eval(DEDUPE_AND_INCREMENT, [`${PREFIX}:seen:${event}:${id}`, dailyKey(day(at))], [
        event,
        versionField,
        RETENTION_SECONDS,
      ])
      return true
    }

    await client.eval(INCREMENT, [dailyKey(day(at))], [event, versionField, RETENTION_SECONDS])
    return true
  } catch {
    return false
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function funnelDays(start: string, end: string): string[] {
  if (!DATE.test(start) || !DATE.test(end)) throw new Error('dates must use YYYY-MM-DD')
  const first = Date.parse(`${start}T00:00:00Z`)
  const last = Date.parse(`${end}T00:00:00Z`)
  if (
    !Number.isFinite(first) ||
    !Number.isFinite(last) ||
    new Date(first).toISOString().slice(0, 10) !== start ||
    new Date(last).toISOString().slice(0, 10) !== end ||
    first > last
  ) {
    throw new Error('invalid funnel date range')
  }
  const dates = []
  for (let at = first; at <= last; at += 86_400_000) dates.push(day(at))
  if (dates.length > 92) throw new Error('funnel range cannot exceed 92 days')
  return dates
}

export interface FunnelAggregate {
  period: { start: string; end: string }
  trials: number
  activatedDevelopers: number
  counts: Record<(typeof REPORT_EVENTS)[number], number>
}

/** Read aggregate-only counts; installation pseudonyms are never returned. */
export async function readFunnelAggregate(
  start: string,
  end: string,
  client: FunnelRedis = redis,
): Promise<FunnelAggregate> {
  const counts = Object.fromEntries(REPORT_EVENTS.map((event) => [event, 0])) as FunnelAggregate['counts']
  for (const date of funnelDays(start, end)) {
    const values = await client.hgetall<Record<string, number | string>>(dailyKey(date))
    for (const event of REPORT_EVENTS) {
      const value = Number(values?.[event] ?? 0)
      if (Number.isFinite(value) && value > 0) counts[event] += value
    }
  }
  return {
    period: { start, end },
    trials: counts.cli_proof_completed + counts.viewed + counts.session_start,
    activatedDevelopers: counts.developer_activated,
    counts,
  }
}

/** Authenticated production smoke probe: proves Redis accepts and removes a write. */
export async function checkFunnel(client: FunnelRedis = redis): Promise<boolean> {
  const key = `${PREFIX}:health:${crypto.randomUUID()}`
  try {
    await client.set(key, '1', { ex: 60 })
    await client.del(key)
    return true
  } catch {
    return false
  }
}
