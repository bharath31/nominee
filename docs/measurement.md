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
activation. It does not support custom events. Outbound npm/GitHub clicks, CLI
copy actions, playground outcomes, and explicitly opted-in CLI reports go to the
agent Worker's optional Analytics Engine `FUNNEL` binding described in
`site/agent-worker/README.md`.

## Activated developer (phase 0)

An **activated developer** has installed nominee, written at least one policy
rule, and completed an enforced execution of one of their own tools through
that policy. Downloads, page views, playground runs, and the bundled CLI proof
are not activation.

The CLI keeps those stages separate:

- `cli_proof_completed` is an explicitly opted-in **trial** of nominee's bundled
  support-agent example.
- `developer_activated` is offered by `nominee activate` only after local
  verification of a non-empty policy, an intact full receipt chain, and a
  matching enforced `policy.decision` / `execution.succeeded` pair.

```bash
npx nominee-cli activate ./nominee.policy.ts ./receipts.json
```

The policy and receipt contents stay local. The CLI shows the exact three-field
payload before asking: event name, a random installation-scoped version-4 UUID,
and the installed CLI version. It persists each event's choice locally before
attempting its request, does nothing when `DO_NOT_TRACK=1` is set, and prompts
only when both standard input and output are terminals. The optional request is
capped at three seconds and cannot change a successful local proof's exit code.
No reporting code exists in the core library.

The Worker validates both CLI events' UUID and semantic version. It returns
`503` instead of claiming success when the `FUNNEL` binding is unavailable. Do
not count an event the Worker did not accept, and never relabel
`cli_proof_completed` as activation.

The playground records the exact anonymous path `viewed` → `edited_policy` →
`ran_call`, with the possible outcomes `blocked`, `approval_requested`, and
`approved`. The homepage separately records `site_npm_click`,
`site_github_click`, and `site_cli_copy`. These events diagnose acquisition;
none count as an activated developer.

## Weekly activation dashboard

For a weekly acquisition baseline, run:

```bash
node scripts/weekly-activation-report.mjs 2026-08-03 2026-08-09
```

With no dates, the script ends on the previous completed UTC day and covers the
seven-day window ending there; it never includes the still-in-progress current
day by default.

The report subtracts, for each day, the minimum download count across all ten
published packages from that day's core `nominee` downloads. The remainder is
the **mirror-adjusted installs** estimate. Raw core downloads and the estimated
automated floor remain diagnostic fields, never headline adoption numbers.
Series are joined by their explicit `day` field; missing coverage fails instead
of silently substituting zero.

Analytics Engine access is deliberately not built into this repository script.
Export only these aggregate counts from the `FUNNEL` dataset—never installation
IDs or raw event rows:

```json
{
  "trials": 24,
  "activatedDevelopers": 8,
  "previousActivatedDevelopers": 5
}
```

`trials` is the week's playground `viewed` count plus distinct installations
that opted in to `cli_proof_completed`. Activated counts are distinct
installation IDs for `developer_activated`. Generate the five-number dashboard
with:

```bash
node scripts/weekly-activation-report.mjs 2026-08-03 2026-08-09 \
  --analytics ./aggregate-funnel-counts.json
```

The five fields are trials, mirror-adjusted installs, activated developers this
week, activation rate (`activated / adjusted installs`), and activated-developer
week-over-week change. A zero denominator is reported as `null`, not `0%`.
Without an aggregate export all analytics-derived values are `null` and the
report explains why; it never manufactures a baseline.

There is intentionally no starting baseline written into this repository yet:
the Worker binding is disabled until Analytics Engine is enabled for the
account. Record the first baseline only after a complete seven-day window of
accepted events. The planning expectation of 10–40 humans is not a measurement
and must not be copied into the dashboard.
