// A support agent closes stale GitHub issues through the OpenAI Agents SDK —
// and the sensitive write pauses for a human on the SDK's *native* approval
// flow, bridged into nominee's receipt chain by nominee-openai.
//
//   1. The agent reads an issue (policy: allow) — runs straight through.
//   2. The agent asks to close it (policy: ask) — the SDK pauses the run with
//      a native tool-approval interruption.
//   3. A human approves in the OpenAI platform UI (offline: state.approve()).
//      On resume, the SDK tells the tool *which call* was approved
//      (isToolApproved + the call id); nominee-openai seals that framework
//      approval — call id, via 'openai-agents' — into nominee before
//      executing, and the credential is fetched fresh at execution time.
//   4. A second close is approved out-of-band (email). Its capability is
//      bound to the exact approved input: a replay with a mutated issue
//      number is refused and sealed into the receipt chain as a denial.
//
// No API keys, no network. The "model" is scripted — see
// src/scripted-model.mjs for why that is honest. Enforcement is identical
// with a real LLM: the model can only ask; the policy and the human decide.
//
//   node run.mjs
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { Agent, Runner } from '@openai/agents'
import { Nominee, allow, ask, formatReceipts, tokens } from 'nominee'
import { nomineeTool } from 'nominee-openai'

import { closeGitHubIssue, getGitHubIssue } from './src/backend.mjs'
import {
  CLOSE_CALL_ID,
  issueCloseParams,
  issueReadParams,
  scriptedSupportModel,
} from './src/scripted-model.mjs'

const dim = (s) => `\x1b[2m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`

/**
 * Run the whole scenario and return its observable evidence.
 * Throws (via assert) if the bridge does not behave as documented — the demo
 * must never pass quietly.
 */
export async function runScenario({ log = () => {} } = {}) {
  // ── Fake backend with an audit trail of what actually got closed ──────
  const closedIssues = []
  let issuedToken
  const close = (input, token) =>
    closeGitHubIssue({ ...input, token }).then((result) => {
      closedIssues.push(input.issue)
      return result
    })

  // ── Policy: reading is fine; closing needs a human ────────────────────
  const nominee = new Nominee({
    agent: 'support-agent',
    policy: {
      rules: [allow('github.issue.read'), ask('github.issue.close')],
      fallback: 'deny',
    },
    receipts: { key: process.env.NOMINEE_RECEIPT_KEY ?? 'demo-signing-key' },
    // A real strategy would hit your vault. Here: a literal that shows a
    // credential is fetched at execution time, not up front.
    strategy: tokens(({ user, connection }) => `ghp_demo_${user}_${connection}`),
    // Out-of-band path: print the request, but do NOT settle it inline.
    // The approver answers later, by email (below).
    onApprovalRequest: (req) => {
      log(yellow(`  ⏸  approval requested: ${req.action} ${JSON.stringify(req.detail)}`))
      log(yellow('  …  waiting for an out-of-band reply (nobody approves inline here)'))
    },
  })

  // ── Tools: plain backend functions behind nomineeTool ─────────────────
  const issueRead = nomineeTool({
    name: 'issue_list',
    description: 'Fetch one GitHub issue',
    parameters: issueReadParams,
    nominee,
    action: 'github.issue.read',
    user: 'alice',
    execute: (input) => getGitHubIssue(input),
  })

  const issueClose = nomineeTool({
    name: 'issue_close',
    description: 'Close a GitHub issue',
    parameters: issueCloseParams,
    nominee,
    action: 'github.issue.close',
    user: 'alice',
    connection: 'github',
    execute: (input, { token }) => {
      issuedToken = token
      return close(input, token)
    },
  })

  const agent = new Agent({
    name: 'support-agent',
    instructions: 'You are a support agent for the acme/widgets repository.',
    tools: [issueRead, issueClose],
  })

  // The runner is configured with the scripted model, so no request ever
  // leaves the process. A real deployment leaves this out and the SDK calls
  // OpenAI — the tools (and everything this demo proves) stay identical.
  const runner = new Runner({ model: scriptedSupportModel(), tracingDisabled: true })
  const context = { user: 'alice' }

  // ── 1 + 2. The run: read (allow) → close (ask) → the SDK pauses ───────
  const firstRun = await runner.run(
    agent,
    'Please check issue #42 on acme/widgets. If it is stale, close it.',
    { context },
  )

  assert.equal(firstRun.interruptions.length, 1, 'the close must pause for approval')
  const approval = firstRun.interruptions[0]
  const callId = approval.rawItem.callId
  assert.equal(callId, CLOSE_CALL_ID)
  assert.equal(approval.rawItem.name, 'issue_close')
  assert.ok(!closedIssues.includes(42), 'the close must not have run before approval')

  log(bold('\n1. The agent reads the issue (policy: allow)\n'))
  log(dim('  issue_list ran straight through — an allow needs no approval'))

  log(bold('\n2. The agent asks to close it (policy: ask)\n'))
  log(yellow('  ⏸  the OpenAI Agents SDK paused the run — native tool approval'))
  log(dim(`  tool: ${approval.rawItem.name}   callId: ${callId}`))
  log(dim(`  args: ${approval.rawItem.arguments}`))
  log(green('  ✓ a human approves in the OpenAI platform UI (offline: state.approve)'))
  firstRun.state.approve(approval)

  // ── 3. Resume: the approved call runs, sealed with nominee evidence ───
  const secondRun = await runner.run(agent, firstRun.state)
  assert.equal(secondRun.finalOutput, 'Done — closed issue #42 on acme/widgets.')
  assert.deepEqual(closedIssues, [42])

  const close42Receipts = nominee.receipts.filter(
    (r) => r.tool === 'github.issue.close' && r.actionId,
  )
  const requested = close42Receipts.find((r) => r.type === 'approval.requested')
  const resolved = close42Receipts.find((r) => r.type === 'approval.resolved')
  assert.ok(requested && resolved, 'the native approval must be sealed as evidence')
  assert.equal(requested.detail?.providerApprovalId, callId)
  const close42Action = await nominee.getAction(requested.actionId)
  assert.equal(close42Action.approval?.via, 'openai-agents')
  assert.equal(close42Action.approval?.providerId, callId)
  assert.ok(issuedToken, 'the credential must be fetched at execution time')

  log(bold('\n3. The approved call runs — with nominee evidence\n'))
  log(dim(`  isToolApproved(toolName, ${callId}) → true`))
  log(dim(`  approval sealed into the action: via=openai-agents providerId=${callId}`))
  log(dim(`  fresh token at execution time: ${issuedToken}`))
  log(green('  ✓ Issue #42 closed on acme/widgets'))

  // ── 4. Out-of-band approval: bound to the exact approved input ────────
  log(bold('\n4. A second close, approved out-of-band (email)\n'))

  const pending = await nominee.prepareAction({
    tool: 'github.issue.close',
    input: { repo: 'acme/widgets', issue: 57, reason: 'docs fix has landed' },
    user: 'alice',
    connection: 'github',
  })
  assert.equal(pending.status, 'pending_approval')

  // The approver replies by email — out of band, with a name on it.
  const resolved57 = await nominee.resolveActionApproval(pending.action.id, {
    decision: 'approved',
    approver: 'dana@acme.com',
    via: 'email',
  })
  const resumed57 = await nominee.resumeAction(resolved57.id)
  assert.ok(resumed57.capability, 'resume must hand out a one-shot capability')

  // A replay with a mutated input must be refused — the capability is bound
  // to the exact approved input hash.
  let mutationError
  try {
    await nominee.executeCapability(
      resumed57.capability,
      { repo: 'acme/widgets', issue: 99, reason: 'docs fix has landed' },
      (ctx) => close(ctx.input, ctx.token),
    )
  } catch (err) {
    mutationError = err
  }
  assert.equal(mutationError?.name, 'AuthorizationInputChangedError')
  assert.ok(!closedIssues.includes(99), 'the mutated close must not have run')

  // The exact approved input executes.
  const closed57 = await nominee.executeCapability(
    resumed57.capability,
    { repo: 'acme/widgets', issue: 57, reason: 'docs fix has landed' },
    (ctx) => close(ctx.input, ctx.token),
  )
  assert.equal(closed57, 'Issue #57 closed on acme/widgets')
  assert.deepEqual(closedIssues, [42, 57])

  const mutationReceipt = nominee.receipts.find(
    (r) =>
      r.type === 'policy.decision' &&
      r.effect === 'deny' &&
      r.reason === 'tool input changed after authorization',
  )
  assert.ok(mutationReceipt, 'the refused mutation must be sealed into the chain')

  const chain = await nominee.verifyReceipts()
  assert.ok(chain.ok, 'the receipt chain must verify')

  log(green('  ✓ dana@acme.com approves by email (resolveActionApproval, via=email)'))
  log(red('  ✗ replay with mutated input (issue #99) refused:'))
  log(dim(`      ${mutationError.message.split('\n')[0]}`))
  log(green('  ✓ the exact approved input executes: Issue #57 closed on acme/widgets'))

  return {
    nominee,
    finalOutput: secondRun.finalOutput,
    closedIssues,
    callId,
    close42ActionId: requested.actionId,
    outOfBand: { actionId: pending.action.id, approver: 'dana@acme.com', via: 'email' },
    mutationError,
    mutationReceipt,
    closed57,
    chain,
  }
}

const main = async () => {
  const scenario = await runScenario({ log: console.log })

  console.log(
    bold('\n5. The receipt chain (hash-chained, optionally HMAC-signed, tamper-evident)\n'),
  )
  for (const line of formatReceipts(scenario.nominee.receipts, { verbose: true }).split('\n')) {
    const denied = line.includes(' deny ')
    console.log(denied ? red(`  ${line}`) : `  ${line}`)
  }
  console.log(
    `\n  chain verifies: ${
      scenario.chain.ok ? green(`✓ ${scenario.chain.checked} receipts intact`) : red('BROKEN')
    }`,
  )
  console.log(dim('\nThe model was only ever asking. The policy — and the human — decided.\n'))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
