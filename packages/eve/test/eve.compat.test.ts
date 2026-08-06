import type { ToolContext } from 'eve/tools'
import { Memory, Nominee } from 'nominee'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { nomineeTool } from '../src/index.js'

/**
 * Compatibility test: eve.test.ts drives `tool.execute` with a `fakeCtx`
 * cast `as never`, which bypasses type-checking against Eve's own context
 * shape entirely. This test builds a `ToolContext` value that must satisfy
 * the *actually installed* `eve` package's real exported type via
 * `satisfies ToolContext` — a future Eve release that adds, removes, or
 * renames a required `ToolContext` field fails `tsc` on this file instead of
 * silently drifting — and drives it through the real `defineTool`-branded
 * tool that `nomineeTool` returns.
 */
function makeNominee(over: Partial<ConstructorParameters<typeof Nominee>[0]> = {}) {
  return new Nominee({
    strategy: Memory({ tokens: { u1: { github: 'gh_tok_123' } } }),
    ...over,
  })
}

function makeToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    session: {
      id: 'session_1',
      auth: { current: null, initiator: null },
      turn: { id: 'turn_1', sequence: 0 },
    },
    getSandbox: async () => {
      throw new Error('sandbox not available in this test')
    },
    getSkill: () => {
      throw new Error('skill not available in this test')
    },
    abortSignal: new AbortController().signal,
    callId: 'call_1',
    toolName: 'close_issue',
    getToken: async () => {
      throw new Error('getToken not exercised in this test')
    },
    requireAuth: () => {
      throw new Error('requireAuth not exercised in this test')
    },
    ...overrides,
  } satisfies ToolContext
}

describe('nominee-eve compatibility with the installed Eve SDK', () => {
  it('runs the real defineTool-branded tool against a real ToolContext shape', async () => {
    let seenCallId: string | undefined
    const tool = nomineeTool({
      nominee: makeNominee(),
      user: 'u1',
      connection: 'github',
      description: 'Close a GitHub issue',
      inputSchema: z.object({ issue: z.number() }),
      execute: async ({ issue }, { token, eve }) => {
        seenCallId = eve.callId
        return `closed #${issue} with ${token}`
      },
    })

    const result = await tool.execute({ issue: 42 }, makeToolContext())
    expect(result).toBe('closed #42 with gh_tok_123')
    expect(seenCallId).toBe('call_1')
  })

  it('rejects with a real ToolContext in scope when the policy denies', async () => {
    const tool = nomineeTool({
      nominee: makeNominee({ policy: { rules: [], fallback: 'deny' } }),
      user: 'u1',
      description: 'delete a repo',
      inputSchema: z.object({ repo: z.string() }),
      execute: async () => 'deleted',
    })

    await expect(
      tool.execute({ repo: 'a/b' }, makeToolContext({ callId: 'call_2', toolName: 'repo_delete' })),
    ).rejects.toThrow(/policy denied/)
  })
})
