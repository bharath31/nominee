// A policy fixture for check.test.ts: every rule matches at least one of the
// CLI's built-in sample tool calls.
export default [
  { effect: 'allow', tools: ['email.read'] },
  { effect: 'deny', tools: ['email.forward'] },
]
