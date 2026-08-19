import { Mastra } from '@mastra/core'
// Mastra approval demo: what nominee adds over the framework's own
// suspend/approve primitives — approve + decline paths, nativeApprovals OFF
// behavior, and a direct tool call that throws ActionPendingError.
//
// No keys. No network. A scripted model drives a real Mastra Agent loop.
import { Agent } from '@mastra/core/agent'
import { InMemoryStore } from '@mastra/core/storage'
import { ActionPendingError, Nominee, allow, ask } from 'nominee'
import { nomineeTool } from 'nominee-mastra'
import { z } from 'zod'

let toolExecutions = 0

const nominee = new Nominee({
  agent: 'wire-agent',
  policy: { rules: [allow('wire.read'), ask('wire.send')], fallback: 'deny' },
  receipts: { key: 'demo-signing-key' },
})

const nativeSend = nomineeTool({
  id: 'wire-send',
  description: 'Send a wire transfer',
  inputSchema: z.object({ cents: z.number() }),
  outputSchema: z.object({ sent: z.boolean() }),
  nominee,
  action: 'wire.send',
  user: 'user-1',
  nativeApprovals: true,
  execute: async (input) => {
    toolExecutions++
    return { sent: true, cents: input.cents }
  },
})

function scriptedModel() {
  return {
    specificationVersion: 'v2',
    provider: 'scripted',
    modelId: 'scripted-1',
    doGenerate: async ({ prompt }) => {
      const hasToolResult = prompt.some((m) => m.role === 'tool')
      if (!hasToolResult) {
        return {
          rawCall: { rawPrompt: null, rawSettings: {} },
          warnings: [],
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-scripted-1',
              toolName: 'wire-send',
              input: JSON.stringify({ cents: 500 }),
            },
          ],
          finishReason: 'tool-calls',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        }
      }
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        warnings: [],
        content: [{ type: 'text', text: 'Wire sent as approved.' }],
        finishReason: 'stop',
        usage: { inputTokens: 20, outputTokens: 6, totalTokens: 26 },
      }
    },
  }
}

const agent = new Agent({
  id: 'wire-agent',
  name: 'Wire Agent',
  model: scriptedModel(),
  instructions: 'You send wires when asked.',
  tools: { 'wire-send': nativeSend },
})

const mastra = new Mastra({
  storage: new InMemoryStore(),
  logger: false,
  agents: { 'wire-agent': agent },
})

// ── A: native approvals ON → approve
console.log('── A1: generate (nativeApprovals ON)')
const out = await agent.generate('Send a wire of 500 cents')
console.log('finishReason:', out.finishReason, '| runId:', out.runId)
console.log('suspendPayload:', JSON.stringify(out.suspendPayload, null, 1))
const receiptsBeforeResume = nominee.receipts.length
console.log(
  'receipts while suspended:',
  receiptsBeforeResume,
  '→',
  nominee.receipts.map((r) => r.type).join(', ') || '(none)',
)

console.log('\n── A2: approveToolCallGenerate')
const resumed = await agent.approveToolCallGenerate({
  runId: out.runId,
  toolCallId: out.suspendPayload?.toolCallId,
})
console.log('resumed text:', resumed.text, '| finishReason:', resumed.finishReason)
console.log('tool executions:', toolExecutions)
console.log('receipts:', nominee.receipts.map((r) => r.type).join(', '))
const requested = nominee.receipts.find((r) => r.type === 'approval.requested')
console.log('approval.requested detail:', JSON.stringify(requested?.detail ?? {}))
const resolvedR = nominee.receipts.find((r) => r.type === 'approval.resolved')
console.log('approval.resolved detail:', JSON.stringify(resolvedR?.detail ?? {}))

// ── B: native approvals ON → decline
console.log('\n── B1: generate again (new run)')
const out2 = await agent.generate('Send a wire of 500 cents again')
console.log('finishReason:', out2.finishReason, '| runId:', out2.runId)
const beforeDecline = nominee.receipts.length

console.log('\n── B2: declineToolCallGenerate')
const declined = await agent.declineToolCallGenerate({
  runId: out2.runId,
  toolCallId: out2.suspendPayload?.toolCallId,
  declineContext: { reason: 'amount too high', message: 'Human declined' },
})
console.log('declined text:', declined.text, '| finishReason:', declined.finishReason)
console.log('tool executions:', toolExecutions)
console.log('receipts added by decline:', nominee.receipts.length - beforeDecline)
const toolMsgs = (declined.messages ?? []).filter((m) => m.role === 'tool')
console.log('tool messages after decline:', JSON.stringify(toolMsgs, null, 1).slice(0, 600))

// ── C: nativeApprovals OFF → agent swallows; direct call throws
console.log('\n── C1: agent with nativeApprovals OFF')
const offSend = nomineeTool({
  id: 'wire-send-off',
  description: 'Send a wire transfer',
  inputSchema: z.object({ cents: z.number() }),
  outputSchema: z.object({ sent: z.boolean() }),
  nominee,
  action: 'wire.send',
  user: 'user-1',
  execute: async (input) => {
    toolExecutions++
    return { sent: true, cents: input.cents }
  },
})
const offModel = {
  specificationVersion: 'v2',
  provider: 'scripted',
  modelId: 'scripted-2',
  doGenerate: async ({ prompt }) => {
    const hasToolResult = prompt.some((m) => m.role === 'tool')
    if (!hasToolResult) {
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        warnings: [],
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-scripted-2',
            toolName: 'wire-send-off',
            input: JSON.stringify({ cents: 500 }),
          },
        ],
        finishReason: 'tool-calls',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }
    }
    return {
      rawCall: { rawPrompt: null, rawSettings: {} },
      warnings: [],
      content: [{ type: 'text', text: 'I could not send it.' }],
      finishReason: 'stop',
      usage: { inputTokens: 20, outputTokens: 6, totalTokens: 26 },
    }
  },
}
const offAgent = new Agent({
  id: 'wire-agent-off',
  name: 'Wire Agent (portable)',
  model: offModel,
  instructions: 'You send wires when asked.',
  tools: { 'wire-send-off': offSend },
})
const mastra2 = new Mastra({
  storage: new InMemoryStore(),
  logger: false,
  agents: { 'wire-agent-off': offAgent },
})
try {
  const out3 = await offAgent.generate('Send a wire of 500 cents')
  console.log('NO THROW. finishReason:', out3.finishReason)
  const msgs = (out3.messages ?? []).filter((m) => m.role === 'tool')
  console.log('tool result the model saw:', JSON.stringify(msgs, null, 1).slice(0, 700))
} catch (err) {
  console.log('THREW from generate:', err.constructor.name)
}
console.log('tool executions:', toolExecutions)

console.log('\n── C2: direct tool call (no Mastra agent loop)')
try {
  await offSend.execute({ cents: 500 }, { requestContext: {} })
  console.log('UNEXPECTED: direct call executed')
} catch (err) {
  console.log(
    'THREW:',
    err.constructor.name,
    '| is ActionPendingError:',
    err instanceof ActionPendingError,
  )
  console.log('actionId:', err.actionId)
}
console.log('receipt types:', nominee.receipts.map((r) => r.type).join(', '))
