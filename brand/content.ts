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
  version: '2.2.1',

  /**
   * First thing a reader meets. Discovery, not a category decision.
   * Taglines below stay the second thing — they convert after the observe report.
   */
  discoveryLead: 'Find out what your agent can actually do.',
  discoverySubhead:
    'One command. No policy. No premise. Observe mode reports the tool callbacks that actually start.',
  discoveryCommand: 'npx nominee-cli observe',

  /** Full hero one-liner (README, docs, OG image) — second, after discovery. */
  taglineFull:
    'Your agent calls tools. Your rules decide what runs. nominee checks each call before your tool code executes.',
  /** Compressed hero for the big display headline on the landing page. */
  taglineShort: 'Your agent calls tools.',
  taglineShortLine2: 'Your rules decide what runs.',

  /** Familiar shorthand for the landing hero, grounded in a product developers use. */
  analogy:
    'Like GitHub branch protection for agent tools. Your rules let routine calls run, hold risky calls for review, and block forbidden calls before the tool runs.',

  /** Scope qualifier — names what nominee is. */
  subhead:
    'nominee is an open-source TypeScript library that checks every AI tool call before your code runs.',

  /** The demonstrable insight that leads every surface. */
  insight:
    'The model was hijacked. The tool still did not run. nominee does not detect prompt injection; a deny rule still stops the forwarded inbox before the handler runs.',
  insightShort: 'The model was hijacked. The tool still did not run.',

  /** The layer diagram: framework | nominee | tools+vault. */
  layers: [
    {
      tag: 'your agent / framework',
      title: 'asks to run a tool',
      eg: 'Vercel AI SDK · Eve · OpenAI Agents · Mastra · Cloudflare Agents · MCP · standalone',
    },
    {
      tag: 'nominee',
      title: 'checks your allow · ask · deny rules',
      eg: 'user · tenant · resource · arguments · budget · approval',
    },
    {
      tag: 'your tools & vault',
      title: 'runs only the action your rules allow',
      eg: 'env · DB · OAuth2 · Auth0 Token Vault · Supabase',
    },
  ],

  /** "When you don't need nominee" — present on every surface. */
  whenNot: [
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
