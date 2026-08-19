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
 * If you change a string here, run `node brand/check-surfaces.mjs` (it asserts
 * the lead headline and its proof) and walk brand/README.md's registry.
 */

export const brand = {
  name: 'nominee',
  version: '2.8.0',

  /**
   * Lead — post-pause correctness. Exactly one lead, and this is it:
   * concede (approval is solved) → gap (the moment after it is not) → proof
   * (token minted at execution, bound to the args a human saw, spent once).
   */
  leadEyebrow: 'Approval is the easy part.',
  leadH1: 'Your agent got approval at 2:14.\nIt executed at 2:31 with a dead token.',
  leadLede:
    'Your framework can pause a tool call. It cannot catch what changes while it waits: tokens expire, arguments drift, permissions change, or approvals get replayed. nominee makes the moment after "approve" correct and leaves a receipt.',
  leadChips: 'token minted at execution · bound to the args a human saw · spendable once',

  /** The lead proof — the number a skeptic cannot argue with. */
  leadProof:
    'naive rotating refresh fails 7/8 under concurrency; nominee gets 8/8 with the same agent code',

  /** Who nominee is true for — a moment, not a persona. */
  beachheadIcp:
    "TypeScript teams whose agent takes a write action on a third-party API on a user's behalf, where a human approves out of band (Slack / email / push), not inside the originating request.",

  /** Disqualifier. The one line above the proof; the honest list lives below it. */
  selfSelectionTest:
    "Does your approval come back in the same HTTP request that asked for it? Then you don't need nominee.",

  /** Observe mode — a section, never the lead. */
  discoveryLead: 'Find out what your agent can actually do.',
  discoverySubhead:
    'One command. No policy. No premise. Observe mode reports the tool callbacks that actually start.',
  /** Shown against the sample report from a hard-coded demo agent. */
  discoveryCommand: 'npx nominee-cli observe',

  /** Full hero one-liner (README, docs) — post-pause correctness. */
  taglineFull:
    'Approval is the easy part. nominee makes the moment after it correct: a fresh token minted at execution, arguments bound to what a human saw, spent once, receipted.',
  /** Compressed hero for the big display headline on the landing page. */
  taglineShort: 'Approval is the easy part.',
  taglineShortLine2: 'The moment after is the hard part.',

  /** Scope qualifier — names what nominee is. */
  subhead:
    'nominee is an open-source TypeScript library that checks every AI tool call before your code runs — and gets the moment after "approve" right.',

  /** The supporting-proof insight, captioned on the injection proof. */
  insightShort: 'The model was hijacked. The tool still did not run.',

  /** The layer diagram: framework | nominee | tools+vault. */
  layers: [
    {
      tag: 'your agent / framework',
      title: 'pauses a tool call for approval',
      eg: 'Vercel AI SDK · Eve · OpenAI Agents · Mastra · Cloudflare Agents · MCP · standalone',
    },
    {
      tag: 'nominee',
      title: 'makes the moment after "approve" correct',
      eg: 'token minted at execution · args a human saw · exact-input binding · receipt',
    },
    {
      tag: 'your tools & vault',
      title: 'runs once, fresh scoped credential, on the record',
      eg: 'env · DB · OAuth2 · Auth0 Token Vault · Supabase',
    },
  ],

  /** "When you don't need nominee" — honest list, always below the proof. */
  whenNot: [
    'Your approval comes back in the same HTTP request that asked for it.',
    'Your agent only reads public or low-risk data.',
    'Your framework already enforces every permission your application needs.',
    'A few local if-statements cover your tools and you do not need durable approvals or shared limits.',
  ],

  urls: {
    site: 'https://nominee.dev',
    docs: 'https://nominee.dev/docs/',
    repo: 'https://github.com/bharath31/nominee',
    npm: 'https://www.npmjs.com/package/nominee',
    securityProofExample:
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
