import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createOpenAI } from '@ai-sdk/openai'
import { stepCountIs, streamText } from 'ai'
import { Nominee, OAuth2, allow, ask, deny } from 'nominee'
import { createTools } from './tools.js'

const USER = 'demo-user'
const AUDIT_LOG = './audit.log'
const STORE = './.tokens.json'
// The org this agent is scoped to — the deny rule below is what actually
// enforces it, not app code that could be skipped by a confused model.
const ALLOWED_OWNER = process.env.GITHUB_ALLOWED_OWNER ?? 'bharath31'

// A tiny on-disk token store standing in for your DB / secret manager. nominee
// READS the refresh token here and WRITES the rotated one back via onRefreshToken
// — the line that lets this agent survive a long run (or one resumed after the
// approval pause) on a provider that rotates refresh tokens.
const readStore = (): { github?: { refreshToken?: string } } =>
  existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : {}
const writeStore = (d: object) => writeFileSync(STORE, JSON.stringify(d, null, 2))

const nominee = new Nominee({
  agent: 'github-agent',
  strategy: OAuth2({
    connections: {
      github: {
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        refreshToken: () => readStore().github?.refreshToken ?? process.env.GITHUB_REFRESH_TOKEN!,
        onRefreshToken: (_p, rt) => {
          const d = readStore()
          d.github = { ...d.github, refreshToken: rt }
          writeStore(d)
        },
      },
    },
  }),
  // What this agent may do as the user, before either tool runs: scoped to
  // one org regardless of tool, reads run free, merges ask a human. First
  // match wins, so the org scope is checked ahead of the per-tool rules.
  policy: {
    rules: [
      deny('github.*', {
        when: ({ input }) => (input as { owner?: string }).owner !== ALLOWED_OWNER,
        reason: `outside the allowed org (${ALLOWED_OWNER})`,
      }),
      allow('github.get_pr'),
      ask('github.merge_pr', { reason: 'a merge is a real write to the org' }),
    ],
    fallback: 'deny',
  },
  // Every decision, approval, and token grant is sealed into a tamper-evident
  // receipt chain — set NOMINEE_RECEIPT_KEY for a real signing key.
  receipts: { key: process.env.NOMINEE_RECEIPT_KEY ?? 'demo-signing-key' },
  // No SaaS for approvals: resolve however you like. Here we auto-approve after a
  // pause to keep the demo runnable — wire this to Slack / a web button for real.
  onApprovalRequest: (req) => {
    console.log(`\n🔐 APPROVAL NEEDED — ${req.action}`, req.detail ?? '')
    console.log('   auto-approving in 2s (replace with a real human decision)…')
    setTimeout(() => nominee.resolveApproval(req.id, 'approved'), 2000)
  },
  // Every token fetch and approval decision lands in the audit log, attributable
  // to the github-agent identity.
  onAudit: (e) => appendFileSync(AUDIT_LOG, `${JSON.stringify(e)}\n`),
})

const { get_pr, merge_pr } = createTools(nominee, USER)

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

const [, , owner = 'bharath31', repo = 'nominee', number = '1'] = process.argv

const result = streamText({
  model: openrouter.chat('openai/gpt-4o-mini'),
  tools: { get_pr, merge_pr },
  stopWhen: stepCountIs(8),
  prompt: `Review pull request #${number} in ${owner}/${repo}. If the diff is small and it is mergeable, merge it. Otherwise explain why you didn't.`,
})

for await (const chunk of result.textStream) process.stdout.write(chunk)
console.log(`\n\naudit trail → ${AUDIT_LOG}`)

console.log(`\nreceipts (${nominee.receipts.length}):`)
for (const r of nominee.receipts) {
  const outcome = r.effect ?? r.decision ?? ''
  console.log(
    `  #${r.seq} ${r.type}${r.tool ? ` ${r.tool}` : ''} ${outcome} ${r.hash.slice(0, 12)}`,
  )
}
const verify = await nominee.verifyReceipts()
console.log(
  `chain verifies: ${verify.ok ? `✓ ${verify.checked} receipts intact` : `✕ broken at #${verify.brokenAt}`}`,
)
