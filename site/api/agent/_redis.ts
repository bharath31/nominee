import { Redis } from '@upstash/redis'

// The Vercel Upstash Marketplace integration sets KV_REST_API_URL /
// KV_REST_API_TOKEN (its own naming, not the UPSTASH_REDIS_REST_* names
// `Redis.fromEnv()` looks for) - construct explicitly instead. One client,
// shared by the session store and the rate limiter.
export const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
})
