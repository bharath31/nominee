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
analytics run also needs **Account Settings Read and Write** to list or create
the Web Analytics site; subsequent runs return immediately once the Pages
project is configured.

Web Analytics measures acquisition and page performance, not product
activation. It does not support custom events. Keep playground outcomes such as
`blocked`, `approval_requested`, and `approved` in the agent Worker's optional
Analytics Engine `FUNNEL` binding described in `site/agent-worker/README.md`.
