import { generateText } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { Memory, Nominee } from 'nominee'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { nomineeTool } from '../src/index.js'

/**
 * Compatibility test: unlike ai.test.ts (which invokes `tool.execute` directly
 * against a hand-rolled `ToolCallOptions` stand-in), this exercises nomineeTool
 * through the AI SDK's *real* `generateText` tool-calling loop, using the
 * actually-installed `ai` package's own `MockLanguageModelV4` test double and
 * real `ToolCallOptions` (toolCallId, messages, …) constructed by the SDK
 * itself. If a future `ai` major changes the tool-call content shape, the
 * execute-invocation contract, or how a thrown error surfaces, this breaks
 * instead of silently drifting.
 */

function makeNominee(over: Partial<ConstructorParameters<typeof Nominee>[0]> = {}) {
  return new Nominee({
    strategy: Memory({ tokens: { u1: { github: 'gh_tok_123' } } }),
    ...over,
  })
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 0, reasoning: undefined },
}

describe('nominee-ai compatibility with the installed AI SDK', () => {
  it('runs execute through the real generateText tool-calling loop with real ToolCallOptions', async () => {
    let seenToolCallId: string | undefined
    const closeIssue = nomineeTool({
      nominee: makeNominee(),
      user: 'u1',
      connection: 'github',
      description: 'Close a GitHub issue',
      inputSchema: z.object({ issue: z.number() }),
      execute: async ({ issue }, { token, ai }) => {
        seenToolCallId = ai.toolCallId
        return `closed #${issue} with ${token}`
      },
    })

    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call' as const,
            toolCallId: 'call_1',
            toolName: 'close_issue',
            input: JSON.stringify({ issue: 42 }),
          },
        ],
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage,
        warnings: [],
      }),
    })

    const result = await generateText({
      model,
      tools: { close_issue: closeIssue },
      prompt: 'Close issue 42',
    })

    const toolResult = result.content.find((part) => part.type === 'tool-result')
    expect(toolResult && 'output' in toolResult ? toolResult.output : undefined).toBe(
      'closed #42 with gh_tok_123',
    )
    expect(seenToolCallId).toBe('call_1')
  })

  it('surfaces a policy denial as a real AI SDK tool-error part, not a thrown generateText rejection', async () => {
    const repoDelete = nomineeTool({
      nominee: makeNominee({ policy: { rules: [], fallback: 'deny' } }),
      user: 'u1',
      description: 'Delete a repo',
      inputSchema: z.object({ repo: z.string() }),
      execute: async () => 'deleted',
    })

    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call' as const,
            toolCallId: 'call_2',
            toolName: 'repo_delete',
            input: JSON.stringify({ repo: 'a/b' }),
          },
        ],
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage,
        warnings: [],
      }),
    })

    const result = await generateText({
      model,
      tools: { repo_delete: repoDelete },
      prompt: 'delete a/b',
    })

    const errorPart = result.content.find((part) => part.type === 'tool-error')
    expect(errorPart).toBeDefined()
    expect(String((errorPart as { error: unknown } | undefined)?.error)).toMatch(/policy denied/)
  })
})
