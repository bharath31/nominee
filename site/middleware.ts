import { agent404 } from '@agent404/next'
import { next } from '@vercel/functions'

// Cloudflare's _worker.js used @agent404/cloudflare's `agent404Worker()` (a
// Worker `fetch` export). Vercel's platform-level Routing Middleware isn't
// Next.js middleware — it has no "return undefined to continue" convenience,
// so `undefined` (agent404's "pass through" signal) has to become an explicit
// `next()`.
const recover = agent404({
  apiKey: process.env.AGENT404_PUBLIC_KEY || 'pk_4f07b4c2d0e64790b3a72d5db97e3402',
})

export default async function middleware(request: Request): Promise<Response> {
  const response = await recover(request)
  return response ?? next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
