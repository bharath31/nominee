import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
// A LangGraph agent asks for a refund, and the ask survives the process that started it.
//
// LangChain JS has no resumable tool-approval primitive: when a nominee `ask`
// rule fires, the tool throws ActionPendingError instead of pausing. This demo
// runs the full out-of-band loop, end to end, offline:
//
//   1. invoke() on a real LangGraph agent → ActionPendingError surfaces at
//      the invoke() boundary with a durable actionId.
//   2. Minutes later, in a different "process": resolveActionApproval().
//   3. resumeAction() → { status: 'ready', capability } — and shows that
//      resuming does NOT execute anything.
//   4. executeCapability() with the persisted original input → the refund
//      runs once. A mutated input is rejected; replaying the capability fails.
//
// Two things this makes visible in the output, because they surprise people:
//   • LangGraph's default ToolNode swallows tool errors and feeds them back
//     to the model as a tool result. To get the durable actionId out, the
//     agent node is wired with handleToolErrors: false so the error breaks
//     the run instead.
//   • nominee's action record stores only the input's HASH. The application
//     persists the raw input itself and hands it back to executeCapability().
//
// No API keys, no network. The "model" is scripted; enforcement is identical
// with a real LLM (the model only ever sees the nominee-wrapped tools).
//
//   node run.mjs
import { Annotation, START, StateGraph } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import {
  ActionPendingError,
  AuthorizationInputChangedError,
  CapabilityInvalidError,
  Nominee,
  allow,
  ask,
  formatReceipts,
  verifyReceipts,
} from 'nominee'
import { nomineeTool } from 'nominee-langchain'
import { z } from 'zod'

const dim = (s) => `\x1b[2m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const bold = (s) => `\x1b[1m${s}\x1b[0m`

// ── The nominee policy: what the agent may DO ───────────────────────────────
const nominee = new Nominee({
  agent: 'support-agent',
  policy: {
    rules: [allow('payments.read'), ask('payments.refund')],
    fallback: 'deny',
  },
  receipts: { key: process.env.NOMINEE_RECEIPT_KEY ?? 'demo-signing-key' },
  // The "approval requested" notification. A production handler would push
  // this to Slack/your UI. This demo deliberately does NOT decide inline —
  // the approval is resolved out-of-band in step 3, exactly as in production.
  onApprovalRequest: (req) => {
    console.log(yellow(`  ⏸  approval requested: ${req.action} ${JSON.stringify(req.detail)}`))
    console.log(dim('      → notified the human (simulated); the decision arrives out-of-band'))
  },
})

// ── The tools: plain functions wrapped with nomineeTool ─────────────────────
let refunds = 0
let reads = 0

const read = nomineeTool({
  name: 'payments_read',
  description: 'Read a payment',
  schema: z.object({ transactionId: z.string() }),
  nominee,
  action: 'payments.read',
  user: 'user-1',
  execute: async ({ transactionId }) => {
    reads++
    return `payment ${transactionId}: 500 cents, paid`
  },
})

const refund = nomineeTool({
  name: 'payments_refund',
  description: 'Refund a payment',
  schema: z.object({ transactionId: z.string(), cents: z.number() }),
  nominee,
  action: 'payments.refund',
  user: 'user-1',
  resource: ({ input }) => `payment:${input.transactionId}`,
  execute: async ({ transactionId, cents }) => {
    refunds++
    return `Refunded ${transactionId} for ${cents} cents`
  },
})

// ── A scripted "model": read the payment, then ask to refund it ─────────────
class ScriptedModel extends BaseChatModel {
  _llmType() {
    return 'scripted'
  }
  bindTools(tools) {
    this.boundTools = tools
    return this
  }
  async _generate(messages) {
    const toolResults = messages.filter((m) => m.getType() === 'tool').length
    if (toolResults === 0) {
      return {
        generations: [
          {
            message: new AIMessage({
              content: '',
              tool_calls: [
                {
                  name: 'payments_read',
                  args: { transactionId: 'tx-1' },
                  id: 'call_lc_1',
                  type: 'tool_call',
                },
              ],
            }),
            text: '',
          },
        ],
      }
    }
    if (toolResults === 1) {
      return {
        generations: [
          {
            message: new AIMessage({
              content: '',
              tool_calls: [
                {
                  name: 'payments_refund',
                  args: { transactionId: 'tx-1', cents: 500 },
                  id: 'call_lc_2',
                  type: 'tool_call',
                },
              ],
            }),
            text: '',
          },
        ],
      }
    }
    return {
      generations: [
        { message: new AIMessage('Refund processed, thanks.'), text: 'Refund processed, thanks.' },
      ],
    }
  }
}

// ── A real LangGraph agent: model ⇄ tools loop ──────────────────────────────
//
// NOTE: the default ToolNode (handleToolErrors: true) would swallow
// ActionPendingError and feed its message back to the model as a tool result —
// the run "completes" and the durable actionId is buried in text. Wiring
// handleToolErrors: false is the production choice when the pending error must
// break the run so your app can catch it and persist the workflow state.
const state = Annotation.Root({
  messages: Annotation({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
})

const model = new ScriptedModel({})
const agent = new StateGraph(state)
  .addNode('agent', async ({ messages }) => ({
    messages: [await model.bindTools([read, refund]).invoke(messages)],
  }))
  .addNode('tools', new ToolNode([read, refund], { handleToolErrors: false }))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', toolsCondition)
  .addEdge('tools', 'agent')
  .compile()

// ══ The agent process ═══════════════════════════════════════════════════════
console.log(bold('\n1. Agent: read the payment (allowed), then refund it (ask)\n'))

let pending
try {
  await agent.invoke({ messages: [new HumanMessage('Refund tx-1 for 500 cents')] })
  console.log(red('  ✗ UNEXPECTED — invoke() completed; the ask did not surface'))
  process.exit(1)
} catch (err) {
  if (!(err instanceof ActionPendingError)) throw err
  pending = err
  console.log(green(`  ✓ payments_read ran (${reads} read)`))
  console.log(green(`  ✓ ActionPendingError surfaced out of invoke():`))
  console.log(dim(`    ${err.message.slice(0, 120)}…`))
  console.log(`    actionId:   ${pending.actionId}`)
  console.log(`    approvalId: ${pending.approvalId}`)
  console.log(yellow(`  ⚠ the refund never ran (refunds executed: ${refunds})`))
}

console.log(bold('\n2. The input-persistence surprise\n'))
console.log('  nominee’s action record keeps only the input’s HASH — it cannot')
console.log('  hand the raw input back to you. Your app persists the input in its')
console.log('  own workflow state, and that is what the execution will be bound to:')
// Your app's durable workflow state — the part nominee does not store.
const workflowState = {
  actionId: pending.actionId,
  approvalId: pending.approvalId,
  input: { transactionId: 'tx-1', cents: 500 },
}
console.log(dim(`  workflow state: ${JSON.stringify(workflowState)}`))

// ══ A different process, minutes later ══════════════════════════════════════
// (Simulated: in production this is an approval UI / webhook / ops console
// talking to the same durable action store — e.g. nominee-postgres.)
await new Promise((r) => setTimeout(r, 300))
console.log(bold('\n3. Minutes later, different process: the human approves\n'))
const resolved = await nominee.resolveActionApproval(workflowState.actionId, {
  decision: 'approved',
  approver: 'ops@acme.com',
  via: 'slack',
})
console.log(`  action status: ${resolved.status}`)
console.log(
  `  record stores: inputHash = ${resolved.inputHash.slice(0, 16)}…` +
    dim('  (still no raw input)'),
)

console.log(bold('\n4. resumeAction() — issues a capability, executes nothing\n'))
const prepared = await nominee.resumeAction(workflowState.actionId)
console.log(
  `  → { status: ${JSON.stringify(prepared.status)}, capability: "${prepared.capability.slice(0, 14)}…" }`,
)
console.log(yellow(`  ⚠ refunds executed so far: ${refunds} — resuming did NOT run the tool`))

console.log(bold('\n5. executeCapability() with the persisted original input\n'))
const result = await nominee.executeCapability(
  prepared.capability,
  workflowState.input,
  ({ input }) => {
    refunds++
    return `Refunded ${input.transactionId} for ${input.cents} cents`
  },
)
console.log(green(`  ✓ ${result}  (refunds executed: ${refunds})`))

console.log(bold('\n6. The same capability, mutated input → rejected\n'))
try {
  await nominee.executeCapability(
    prepared.capability,
    { transactionId: 'tx-1', cents: 50000 },
    () => {
      refunds++
      return 'MUTATED REFUND RAN'
    },
  )
  console.log(red('  ✗ UNEXPECTED — the mutated input executed'))
  process.exit(1)
} catch (err) {
  if (!(err instanceof AuthorizationInputChangedError)) throw err
  console.log(green(`  ✓ rejected: ${err.constructor.name}`))
  console.log(dim(`    ${err.message.slice(0, 110)}…`))
  console.log(
    `    (the capability was bound to the APPROVED arguments — refunds executed: ${refunds})`,
  )
}

console.log(bold('\n7. …and the capability is single-use\n'))
try {
  await nominee.executeCapability(prepared.capability, workflowState.input, () => 'REPLAY RAN')
  console.log(red('  ✗ UNEXPECTED — the capability executed twice'))
  process.exit(1)
} catch (err) {
  if (!(err instanceof CapabilityInvalidError)) throw err
  console.log(green(`  ✓ rejected: ${err.constructor.name} — one capability, one execution`))
}

// ── The receipt chain: the whole loop, sealed ───────────────────────────────
console.log(bold('\n8. The receipt chain (hash-chained, tamper-evident)\n'))
for (const line of formatReceipts(nominee.receipts, { verbose: true }).split('\n')) {
  const denied = / deny | denied /.test(line)
  console.log(denied ? red(`  ${line}`) : `  ${line}`)
}
const ok = nominee.verifyReceipts()
console.log(
  `\n  chain verifies: ${ok.ok ? green(`✓ ${ok.checked} receipts intact`) : red('BROKEN')}`,
)

console.log(
  dim(
    '\nThe ask outlived the request. The approval, the exact arguments, and the\nsingle execution are one hash-chained record — and the model was never asked to trust.\n',
  ),
)
