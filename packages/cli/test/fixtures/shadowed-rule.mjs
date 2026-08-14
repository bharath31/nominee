// Policy used to assert first-match shadowing: deny never runs after allow('*').
export default {
  rules: [
    { effect: 'allow', tools: ['*'] },
    { effect: 'deny', tools: ['customers.export'] },
  ],
  fallback: 'deny',
}
