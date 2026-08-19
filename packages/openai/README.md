# nominee-openai

Decision-bound tools for the OpenAI Agents SDK.

```ts
import { Agent } from '@openai/agents'
import { Nominee, allow, ask } from 'nominee'
import { nomineeTool } from 'nominee-openai'
import { z } from 'zod'

const nominee = new Nominee({
  policy: {
    rules: [allow('github.issue.read'), ask('github.issue.close')],
    fallback: 'deny',
  },
})

const closeIssue = nomineeTool({
  name: 'close_issue',
  description: 'Close one GitHub issue',
  parameters: z.object({ repo: z.string(), issue: z.number() }),
  nominee,
  action: 'github.issue.close',
  user: ({ context }) => context.context.userId,
  resource: ({ input }) => `repo:${input.repo}#${input.issue}`,
  connection: 'github',
  scopes: ['issues:write'],
  execute: async ({ repo, issue }, { token }) => {
    // The credential is fetched only after the exact call is authorized.
    return closeGitHubIssue({ repo, issue, token })
  },
})

const agent = new Agent({ name: 'support-agent', tools: [closeIssue] })
```

Nominee `ask` rules are evaluated by the SDK's `needsApproval` hook. OpenAI
pauses the run, and on resume the adapter verifies the approved tool-call id
from `RunContext` before recording approval evidence and executing. Denials
remain exceptions and never call the underlying tool.

## What happens on `ask`

This adapter maps Nominee `ask` (and `needsApproval`) into the OpenAI Agents SDK's **native, resumable approval** flow: the run pauses for a human decision, and on resume the adapter verifies the approved tool-call id from `RunContext` and seals it as framework approval evidence on the action before `execute` runs. A denial remains an exception and never calls the tool. If `execute` runs without verifiable framework approval (e.g. a direct call that bypassed the SDK's pause), the portable path applies instead: the `ask` is settled inline when possible, or the call throws `ActionPendingError` with a durable `actionId` — persist that id and the original input, then resume with `resolveActionApproval()` → `resumeAction()` → `executeCapability()`. Full walkthrough: [Approvals that outlive the request](https://nominee.dev/docs/approvals/).

## Observe before enforcing

Use the same tool with `new Nominee({ mode: 'observe' })` to inventory the
callbacks that actually run before writing a policy. The adapter's
`needsApproval` hook returns `false` in this mode—including for an explicitly
configured approval—while the original ask/deny verdict remains on the action
and receipts. Observation reports do not retain raw string/boolean values or
user IDs; numeric aggregates may be sensitive. Observe mode is not a security
control and cannot be combined with `production: true`.
