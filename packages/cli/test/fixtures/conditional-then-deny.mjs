// Conditional allow does not shadow a later deny for the same tool.
export default {
  rules: [
    {
      effect: 'allow',
      tools: ['email.forward'],
      when: ({ input }) => typeof input?.to === 'string' && input.to.endsWith('@acme.com'),
    },
    { effect: 'deny', tools: ['email.forward'] },
  ],
  fallback: 'deny',
}
