# Usage measurement

Nominee's unit of usage is a **governed application principal** — a real signed-in
user whose agent action was evaluated — not an npm download or an SDK developer.
This document covers the opt-in reporter that lets you measure that without
putting user identifiers into your analytics pipeline.

## Definitions

- **Activated integration:** one real user/resource/action path has completed
  through `run()` or `executeCapability()` against your real authorization
  source.
- **Governed daily active principal:** a distinct installation-scoped
  `principalId` with at least one real governed action on a UTC day.
- Synthetic traffic, examples, health checks, and load tests never count.

Successful, failed, denied, and expired actions all demonstrate active use, so
report the status mix separately — an integration that denies everything should
not look healthy. Deduplicate on `eventId`.

## Privacy-preserving reporter

The core ships an opt-in reporter that sends data only to the sink your
application configures. Nominee has no telemetry of its own and phones nowhere.

```ts
import { Nominee, usageReporter } from 'nominee'

const nominee = new Nominee({
  // ...
  onGovernedAction: usageReporter({
    key: process.env.NOMINEE_USAGE_HASH_KEY,
    sink: (event) => analytics.track(event),
  }),
})
```

It emits a stable HMAC pseudonym for the principal, an optional tenant
pseudonym, an idempotent event id, terminal status, and timestamp. By default it
does **not** include raw user or tenant ids, resource, input, result, receipt,
credential, or action name. `includeAction: true` is explicit opt-in.

Use a random per-installation key, and do not reuse the receipt signing key —
that would let an analytics sink correlate pseudonyms against the receipt chain.
The default reporter is best-effort so analytics downtime cannot turn a
successful side effect into an application error.

## What to track

Per integration and week:

- days to first real governed action;
- connected authorization sources;
- protected actions per integration;
- governed daily/weekly active principals, and 7/28-day retention;
- allow / ask / deny / fail status mix;
- whether a previously broad credential now sits behind the boundary;
- expansion from one protected action to two.

The last two are the ones that indicate Nominee is actually load-bearing. An
integration that only renders a confirmation dialog has not exercised the
authorization boundary.

## Launch-site analytics

The static site uses Cloudflare Web Analytics for privacy-first page views,
visitors, and Web Vitals. Before each Pages deployment,
`scripts/configure-cloudflare-web-analytics.mjs` reuses or creates the
`nominee.dev` analytics site and attaches its public tag and token to the
`nominee-dev` Pages project. Cloudflare injects the beacon into the next
deployment, so analytics markup and tokens do not need to be copied into every
HTML file.

The `CLOUDFLARE_API_TOKEN` repository secret needs **Pages Write**. Its first
analytics run also needs the account-level **Account Analytics** permission
(Read to reuse an existing site, Edit to create one) to list or create the Web
Analytics site; subsequent runs return immediately once the Pages project is
configured.

Analytics is advisory, so a token without that permission logs a warning and
the deployment continues — the site publishes with or without the beacon.
Anything else (an unreadable Pages project, a half-applied build config) still
fails the run.

Web Analytics measures acquisition and page performance, not product
activation. It does not support custom events. Keep playground outcomes such as
`blocked`, `approval_requested`, and `approved` in the agent Worker's optional
Analytics Engine `FUNNEL` binding described in `site/agent-worker/README.md`.

## Activated developer (phase 0)

An **activated developer** is an anonymous CLI installation that successfully
finishes the offline proof and then explicitly opts in to reporting
`cli_proof_completed`. This is intentionally narrower than downloads, page
views, or playground runs. The CLI shows the exact payload before asking,
persists the choice locally **before** attempting the request so it asks only
once, reads `cliVersion` from its own installed package, and does nothing when
`DO_NOT_TRACK=1` is set. The optional request is capped at three seconds and
cannot change the successful proof's exit code. No reporting code exists in the
core library.

The Worker accepts a CLI event only when it carries the expected version-4
installation UUID and a valid CLI version. It returns `503` instead of claiming
success when the Analytics Engine `FUNNEL` binding is unavailable; in that case
the CLI says the activation was not sent. Enable the binding before treating
opt-ins as an activation source.

The playground records the anonymous path from `playground_run` through allow,
block, approval request, approve, or deny in the Worker's optional `FUNNEL`
dataset. These events diagnose the acquisition funnel; they do not count as an
activated developer.

For a weekly acquisition baseline, run:

```bash
node scripts/weekly-activation-report.mjs 2026-08-03 2026-08-09
```

The report subtracts, for each day and each published package, the minimum
download count observed across all packages. That common floor is labeled as
estimated automated monorepo traffic. The remainder is still only an
**estimated human download** and must never be presented as observed activation.
Series are joined by their explicit `day` field; missing date coverage fails the
report instead of silently substituting zero.
