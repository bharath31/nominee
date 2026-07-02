/**
 * brand/content.ts — the single source of truth for nominee's positioning copy.
 *
 * Every *narrative* surface should derive its hero/tagline/when-not/layer copy
 * from here so a positioning change is one edit, not a dozen:
 *   - Visual assets (README banner, OG image, demo video) IMPORT this directly —
 *     see brand/compositions/*.tsx (rendered with Remotion).
 *   - Static surfaces that can't import TS (README.md, site/*.html, llms.txt)
 *     are kept in sync by hand against these strings; brand/README.md lists them
 *     as the "surface registry".
 *
 * If you change a string here, run `node brand/check-surfaces.mjs` (if present)
 * or walk brand/README.md's registry.
 */

export const brand = {
  name: 'nominee',
  version: '2.1.0',

  /** Full hero one-liner (README, docs, OG image). */
  taglineFull:
    'The authorization layer for AI agents. Your agent logs in as you — nominee decides what it can do as you.',
  /** Compressed hero for the big display headline on the landing page. */
  taglineShort: 'Your agent logs in as you.',
  taglineShortLine2: "It shouldn't get to be you.",

  /** Scope qualifier — names what nominee is. */
  subhead:
    'Policy, approvals, and receipts on every agent tool call — dependency-free, framework-neutral, no SaaS.',

  /** The demonstrable insight that leads every surface. */
  insight:
    'A prompt-injected agent tries to exfiltrate your email — and physically can’t: the deny rule fires before the tool runs, and a signed, tamper-evident receipt of the attempt is on the chain.',
  insightShort:
    'The injected exfiltration is blocked before the tool runs — with a signed receipt of the attempt.',

  /** The layer diagram: framework | nominee | tools+vault. */
  layers: [
    {
      tag: 'your agent / framework',
      title: 'calls a tool as your user',
      eg: 'Vercel AI SDK · Eve · Mastra · Cloudflare Agents · MCP · standalone',
    },
    {
      tag: 'nominee',
      title: 'policy · approvals · receipts · delegation',
      eg: 'allow / deny / ask · budgets · hash-chained receipts · fresh tokens at call time',
    },
    {
      tag: 'your tools & vault',
      title: 'what actually runs — with only the authority you granted',
      eg: 'env · DB · OAuth2 · Auth0 Token Vault · Supabase',
    },
  ],

  /** "When you don't need nominee" — present on every surface. */
  whenNot: [
    'A read-only agent with no authority worth guarding.',
    'Your platform’s native permission system covers you end-to-end.',
    'You want one fully-managed vendor for tools + auth + policy — use Arcade or Composio directly.',
  ],

  urls: {
    site: 'https://nominee.dev',
    docs: 'https://nominee.dev/docs/',
    repo: 'https://github.com/bharath31/nominee',
    npm: 'https://www.npmjs.com/package/nominee',
    proofExample:
      'https://github.com/bharath31/nominee/tree/main/examples/prompt-injection-blocked',
  },

  colors: {
    paper: '#faf9f5',
    ink: '#0b1020',
    inkSoft: '#3a4154',
    muted: '#71798c',
    seal: '#8c2f2a',
    sealBright: '#a8413a',
    line: '#e7e3d8',
    ok: '#1f6b4a',
  },
} as const

export type Brand = typeof brand
