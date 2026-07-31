import { Nominee, allow, ask } from 'nominee'
import { requestAccess } from './broker.js'

// LEVEL 2 — with nominee (works for everybody).
//
// nominee's job: get a valid merge-access token at the *moment* the agent acts,
// never hold one across a pause. The strategy requests fresh just-in-time access
// from the broker on every call; because the token is short-lived, nominee never
// caches it — so a merge always runs with access that is valid right now.
export const nominee = new Nominee({
  strategy: async () => {
    const { token, expiresAt } = await requestAccess()
    return { token, expiresAt }
  },
  agent: 'github-agent',
  // What this agent may do, before either tool runs: reads run free, merges
  // ask. The ask is honestly resolved below by the real human decision Eve's
  // own `needsApproval: always()` gate (in merge_pr_with_nominee.ts) already
  // collected in the chat, before execute() runs. Inside execute, nomineeTool
  // routes through run(): policy checks the exact merge args, issues a
  // single-use capability, then resolves fresh broker access at consumption.
  policy: {
    rules: [
      allow('github.review_pr'),
      ask('github.merge_pr_with_nominee', { reason: 'a merge is a real write' }),
    ],
    fallback: 'deny',
  },
  receipts: { key: process.env.NOMINEE_RECEIPT_KEY ?? 'demo-signing-key' },
  onApprovalRequest: (req) => req.approve(),
})
