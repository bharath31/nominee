# auth0-github-agent — a durable agent that pauses, emails you, and survives the wait

> **This is the deployed `nominee.dev/agent` worker**, kept in `site/` so it ships
> with the microsite. It is the production demo, not a teaching example — for a
> minimal, runnable walkthrough see [`examples/github-agent`](../../examples/github-agent).

The honest, deep demo. **You** connect your GitHub through Auth0 (real OAuth
consent). Then you start a **multi-step agent session** that runs as a
**Durable Object**:

1. The agent reads your real GitHub (profile + recent repos) with a fresh
   nominee token, and drafts a gist summarizing the session.
2. It hits the sensitive action (publish the gist) and **pauses** — it emails
   you an approve/deny link and **hibernates**. No compute runs while it waits.
3. You approve **out of band**, from your phone or inbox, minutes or hours later.
4. The Durable Object wakes. nominee fetches the GitHub token **at that moment**
   from Auth0 Token Vault — never a token captured at session start — and the
   agent publishes the gist on your account.
5. The console shows the full live timeline: the pause clock, the resume after
   the gap, the call-time token, and the audit chain.

This is the value prop you can't fake: a long-running agent whose **access
outlives the pause** because nominee re-resolves the token at action time, plus
**human approval that arrives out of band** (email/phone), not a blocking
in-browser button.

## Why a Durable Object

A real agent session doesn't finish in one request — it waits for a human. The
DO holds the session state (and the user's refresh token) durably across the
pause. `src/action-store.ts` ports nominee's decision-bound action lifecycle
(`prepareAction` → `pending_approval` → `resolveActionApproval` →
`resumeAction` → `executeCapability`) onto `DurableObjectStorage`, so the
gist-publish action and its single-use capability survive hibernation exactly
like the session state and receipt chain do. The strategy still reads the
refresh token from durable storage at call time, so the credential
`executeCapability` resolves is fresh whether the wake is 30s or 3h later.

## Setup (one-time)

1. **GitHub App** (not a classic OAuth App — only Apps issue refresh tokens) with
   "Expire user authorization tokens" on, account permission `gists: write`.
2. **Auth0 → GitHub social connection** using that App's id/secret, with
   **Token Vault / Connected Accounts enabled** (`connected_accounts.active`).
3. **Auth0 → Regular Web App**: callback `https://nominee.dev/agent/callback`,
   logout `https://nominee.dev/agent`, grants Authorization Code + Refresh Token.
4. **Resend**: a verified sending domain; the `FROM` var in `wrangler.toml` uses
   it. (See `packages/auth0/README.md` for the Token Vault gotchas in detail.)

## Secrets

```bash
wrangler secret put AUTH0_DOMAIN
wrangler secret put AUTH0_CLIENT_ID
wrangler secret put AUTH0_CLIENT_SECRET
wrangler secret put SESSION_SECRET   # openssl rand -hex 32
wrangler secret put RESEND_API_KEY   # for the out-of-band approval email
wrangler secret put NOMINEE_RECEIPT_KEY
wrangler deploy
```

Live at https://nominee.dev/agent. Swap `Auth0(...)` for `OAuth2(...)` or a
function and the same agent code works with any provider — Token Vault is just
the managed source here.

## Optional analytics (no secrets)

Neither of these needs `wrangler secret put` — leave them unset and the demo
still works (beacon omitted; internal funnel writes no-op). The public funnel
collector returns `503` while its sink is absent so an opt-in CLI never reports
a false success.

### `CF_BEACON_TOKEN` — Cloudflare Web Analytics

Pages' automatic beacon never reaches this worker (`/agent*` is a separate
service). To measure `/agent` traffic:

1. Cloudflare dashboard → Pages project → **Web Analytics** → manual setup.
2. Copy the **site token** (not the whole snippet).
3. Uncomment `CF_BEACON_TOKEN` under `[vars]` in `wrangler.toml` and paste it.
   It is embedded in public HTML, so a plain var is correct — not a secret.

### `FUNNEL` — Analytics Engine

Demo funnel events (`session_start` / `blocked` / `approved` / …) write to an
Analytics Engine dataset when bound. The binding stays **commented out** in
`wrangler.toml` because a worker with that binding fails to deploy until
Analytics Engine is enabled on the account (error 10089). The code already
guards `env.FUNNEL?`.

The public `POST /agent/funnel` route accepts only an explicit allowlist:

- CLI trial `cli_proof_completed` and verified activation
  `developer_activated`;
- playground `viewed`, `edited_policy`, `ran_call`, `blocked`,
  `approval_requested`, and `approved`; and
- homepage `site_npm_click`, `site_github_click`, and `site_cli_copy`.

Arbitrary event names are rejected. Both CLI events must carry a version-4
installation UUID and the CLI's own semantic version. They are sent only after
the CLI prints its exact payload, persists that event's one-time choice, and the
developer opts in; `DO_NOT_TRACK=1` suppresses even the prompt. A proof of the
bundled CLI example is a trial, not activation. `developer_activated` is offered
only after the CLI locally verifies a non-empty policy and an intact receipt
chain containing a matching enforced execution. Analytics Engine stores
`[event, installationId, cliVersion]` in its three blob fields; browser events
leave the last two fields empty.

To enable:

1. Dashboard → Workers → **Analytics Engine** → enable for the account.
2. Uncomment the `[[analytics_engine_datasets]]` block in `wrangler.toml`
   (`binding = "FUNNEL"`, `dataset = "nominee_agent_funnel"`).
3. Redeploy.

Until all three steps are complete, `POST /agent/funnel` returns `503` and the
CLI prints `Report was not sent.`

## Routes

| Route | Who calls it | What it does |
|---|---|---|
| `POST /agent/session/start` | the logged-in console | creates the DO, runs steps 1–2, emails you, hibernates |
| `GET /agent/session/:id` | the console (polling) | live session state for the timeline |
| `GET /agent/approve?id=&k=` | **the email link** | wakes the DO, fetches a fresh token, publishes |
| `GET /agent/deny?id=&k=` | the email link | stays paused, no action |
| `GET /agent/demo/token`, `/agent/demo/api` | the homepage race | short-TTL token + guarded API for the in-browser nominee race |
