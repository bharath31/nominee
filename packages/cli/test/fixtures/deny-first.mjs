// deny comes first, so customers.export is not shadowed. Reachability still
// depends on the sample list (pass --tools=customers.export in the test).
export default {
  rules: [
    { effect: 'deny', tools: ['customers.export'] },
    { effect: 'allow', tools: ['*'] },
  ],
  fallback: 'deny',
}
