// A fake GitHub backend — no network, no credentials.
//
// It exists so the demo's tool calls have a realistic target: the agent's
// tools do something observable, and the only "side effect" is the returned
// string (what a real client would get back from the GitHub API).
const ISSUES = {
  'acme/widgets#42': {
    number: 42,
    title: 'Flaky login on Safari',
    state: 'open',
    updated_at: '2025-03-02',
    labels: ['bug'],
  },
  'acme/widgets#57': {
    number: 57,
    title: 'Docs: token rotation example is outdated',
    state: 'open',
    updated_at: '2025-01-19',
    labels: ['docs'],
  },
}

export const getGitHubIssue = async ({ repo, issue }) => {
  const found = ISSUES[`${repo}#${issue}`]
  if (!found) return `Issue #${issue} not found on ${repo}`
  return JSON.stringify(found)
}

export const closeGitHubIssue = async ({ repo, issue }) => {
  // A real client would send the token in an Authorization header. This fake
  // does not validate it — the point of the example is the authorization
  // boundary in front of the backend, not GitHub authentication.
  return `Issue #${issue} closed on ${repo}`
}
