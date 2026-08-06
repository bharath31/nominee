// A policy fixture for check.test.ts: the second rule's tool name is
// misspelled and will never match any sample call.
export default {
  rules: [
    { effect: 'allow', tools: ['email.read'] },
    { effect: 'allow', tools: ['emial.send'] },
  ],
  fallback: 'deny',
}
