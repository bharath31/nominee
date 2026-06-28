# github-agent — a PR review-and-merge agent that survives the pause

An [Eve](https://eve.dev) agent that reviews a real pull request and merges it
**on your behalf**. The point it proves: a long-running agent's token goes stale
during the wait for approval — but nominee re-resolves a **fresh token at merge
time**, so the merge just works no matter how long the pause was.

Everything here is **real** — including the token expiry. No mocking.

## The setup: a merge-access broker

Merging a protected branch is privileged, so this demo gates it the way real orgs
do: behind a **merge-access broker** (`service/broker.ts`) that hands out
**just-in-time, short-lived access tokens**. The broker is the only thing holding
the GitHub credential; the agent only ever gets a token that's valid for a few
seconds — least-privilege, just-in-time access. That short lifetime is genuine:
the broker enforces it and returns a real **HTTP 403** when a token has lapsed.
Nothing is simulated; we just don't have to wait an hour to see a token expire,
because it's *our* token with a deliberately short TTL.

That's the whole point made concrete: a long-running agent that grabs access up
front finds it expired by the time a human approves.

## Three levels

Once it's running, you drive the demo by what you say in the chat:

| Say | Tool | What it shows |
| --- | --- | --- |
| **"merge pr"** | `merge_pr` | The hand-rolled way: request access, wait for approval, merge — but the access expired during the wait → **real 403 from the broker**. The problem most people hit. |
| **"merge with nominee"** | `merge_pr_with_nominee` | nominee requests **fresh access at merge time**; you approve in the chat → **real merge**. |
| **"merge with nominee and auth0"** | `merge_pr_with_nominee_auth0` | The token is a real GitHub token from **Auth0 Token Vault** and approval is a **CIBA push to your phone**. |

## Prerequisites

- [Node 24](https://nodejs.org) (`nvm use` — `.nvmrc` pins it).
- A **[Vercel](https://vercel.com) account** — Eve routes the model through the
  Vercel AI Gateway. `pnpm setup` runs `eve link` to connect it.
- A **GitHub account** — `pnpm setup` uses the `gh` CLI for a real token.
- **Level 3 only:** an **[Auth0](https://auth0.com) account** with **Token Vault
  + CIBA** (these are advanced features — not on free/basic tenants), and the
  **[Auth0 Guardian](https://auth0.com/docs/secure/multi-factor-authentication/auth0-guardian)
  app** on your phone (it receives the approval push). Enable the **push**
  factor in your tenant: Security → Multi-factor Auth → Push Notifications.

The setup script installs the `vercel`, `gh` (and for Level 3, `auth0`) CLIs if
they're missing and runs their logins.

## Run it

```bash
nvm use            # Node 24
pnpm install       # from the repo root
pnpm setup         # installs CLIs, eve link (model), writes a GitHub token → .env.local
pnpm seed          # creates a testbed repo on YOUR GitHub + opens a PR to act on
```

Then run the broker and the agent in **two terminals**:

```bash
pnpm broker        # terminal 1 — the merge-access broker (holds the GitHub credential)
pnpm dev           # terminal 2 — the agent (interactive chat)
```

`pnpm seed` creates `‹your-username›/nominee-agent-testbed` (public) the first
time and opens a fresh PR, printing the exact line to paste. Then in the chat:

```
› review PR #1 on ‹your-username›/nominee-agent-testbed
› merge pr                     ← fails: access expired during the wait (real 403)
› merge with nominee           ← approve in chat → real merge
```

Merging closes the PR, so run `pnpm seed` again for another round. To use a repo
you already own instead, set `TESTBED_REPO=owner/repo` before `pnpm seed`.

### Level 3 — Auth0 Token Vault + CIBA

```bash
pnpm setup:auth0   # provisions the Auth0 app, reuses/creates the Token Vault github
                   # connection, sets the CIBA + federated grants, one consent click
pnpm dev
```

**First-time MFA enrollment (you won't get stuck).** During the `setup:auth0`
consent, you log in through GitHub. Because Token Vault / Connected Accounts is a
sensitive operation, Auth0 requires MFA — so on your **first** login it shows a
QR code. Scan it with the **Auth0 Guardian** app to enroll your phone (a one-time
step). That same enrolled device is what receives the **CIBA approval push** when
the agent merges. New users enroll inline here; returning users are just prompted
to approve.

Then: `merge with nominee and auth0` — nominee pulls a fresh GitHub token from
Token Vault and pushes the approval to your phone. Approve it, and the merge runs.
If Auth0 isn't configured, the tool tells you to run `pnpm setup:auth0`.

## What nominee removes

The plain merge — what you write by hand, and it still breaks under a pause
(`agent/tools/merge_pr.ts`):

```ts
const access = await requestAccess()           // grab access once, up front
await waitForApproval()                         // ...long pause...
const res = await brokerMerge(access.token, pr) // access expired → broker 403
// now what? request again? thread it through? this is the bookkeeping you write.
```

The merge **with** nominee (`agent/tools/merge_pr_with_nominee.ts`) — the
bookkeeping is gone:

```ts
connection: 'github',     // nominee requests fresh access at call time
needsApproval: always(),  // human-in-the-loop, right in the chat
```

And Level 3 is the *same tool shape* — only the nominee instance changes
(`auth0()` instead of the gh-token strategy), and approval becomes a CIBA phone
push. You never write token-refresh or approval plumbing at any level.
