export const closeGitHubIssue = async ({
  repo,
  issue,
  token,
}: { repo: string; issue: number; token?: string }) => {
  return `Issue #${issue} closed on ${repo}`
}
