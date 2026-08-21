// No Cloudflare-specific code here either (the `FUNNEL` binding is a plain
// structural interface) - reused unchanged. `trackFunnel` no-ops (returns
// false) since this Vercel `Env` never has a `FUNNEL` field, same disabled
// state as the Cloudflare side (commented out in wrangler.toml).
export { parsePublicFunnelEvent, trackFunnel } from '../../agent-worker/src/funnel.js'
export type { PublicFunnelEvent } from '../../agent-worker/src/funnel.js'
