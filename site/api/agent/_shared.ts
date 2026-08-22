// Utilities shared between the Edge Function route handler ([[...path]].ts)
// and the session-store module - split out so neither has to import the
// other just for a handful of one-line helpers.

export interface Env {
  AUTH0_DOMAIN: string
  AUTH0_CLIENT_ID: string
  AUTH0_CLIENT_SECRET: string
  SESSION_SECRET: string
  RESEND_API_KEY: string
  FROM: string
  NOMINEE_RECEIPT_KEY: string
  FUNNEL_ADMIN_TOKEN: string
}

export function loadEnv(): Env {
  return {
    AUTH0_DOMAIN: process.env.AUTH0_DOMAIN ?? '',
    AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID ?? '',
    AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET ?? '',
    SESSION_SECRET: process.env.SESSION_SECRET ?? '',
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
    // Verified Resend sending domain (shared with the cf-agent testbed) -
    // not a secret, same default wrangler.toml ships as a plain [vars] entry.
    FROM: process.env.FROM ?? 'nominee <agent@email.nominee.dev>',
    NOMINEE_RECEIPT_KEY: process.env.NOMINEE_RECEIPT_KEY ?? '',
    FUNNEL_ADMIN_TOKEN: process.env.FUNNEL_ADMIN_TOKEN ?? '',
  }
}

export const ORIGIN = 'https://nominee.dev'

export const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, null, 2), {
    status: s,
    headers: { 'content-type': 'application/json' },
  })

export const short = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 140)

export const escapeHtml = (s: string) =>
  s.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m] as string)
