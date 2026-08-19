// The "model" in this demo is scripted — it is not an LLM.
//
// Each entry in the turn script is one model response, played back in order.
// The script is written the way a real support model would answer the same
// conversation: read the issue first, then try to close it, then reply.
//
// What makes this honest is that the script has no power. It can only *ask*
// for a tool call; whether the call executes, pauses for a human, or is
// refused is decided entirely by the nominee policy and approval flow in
// front of the tool. Swapping the script for a real LLM changes nothing
// about the enforcement: the model sees the same guarded tools, and the
// same receipts come out.
//
// The turn plan:
//   1. read issue #42            → policy `allow` → runs without approval
//   2. close issue #42            → policy `ask`   → the SDK pauses the run
//   3. final answer to the user   → after the approved close succeeds
import { z } from 'zod'

export const CLOSE_CALL_ID = 'call_close_42'

export const scriptedSupportModel = () => {
  const turns = [
    [
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'Let me look at issue #42 first.' }],
      },
      {
        type: 'function_call',
        callId: 'call_list_42',
        name: 'issue_list',
        arguments: JSON.stringify({ repo: 'acme/widgets', issue: 42 }),
      },
    ],
    [
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: 'Issue #42 has been open since March and looks stale. I will close it.',
          },
        ],
      },
      {
        type: 'function_call',
        callId: CLOSE_CALL_ID,
        name: 'issue_close',
        arguments: JSON.stringify({
          repo: 'acme/widgets',
          issue: 42,
          reason: 'stale since March',
        }),
      },
    ],
    [
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        phase: 'final_answer',
        content: [{ type: 'output_text', text: 'Done — closed issue #42 on acme/widgets.' }],
      },
    ],
  ]

  let call = 0
  return {
    async getResponse() {
      const output = turns[call]
      if (output === undefined) throw new Error('scripted model: turn script exhausted')
      call += 1
      return {
        usage: { requests: 1, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        output,
      }
    },
    getStreamedResponse() {
      throw new Error('scripted model: streaming is not used by this demo')
    },
  }
}

// Tool input schemas — the SDK serializes these into the model's tool list,
// exactly as it would for a real model.
export const issueReadParams = z.object({ repo: z.string(), issue: z.number() })
export const issueCloseParams = z.object({
  repo: z.string(),
  issue: z.number(),
  reason: z.string(),
})
