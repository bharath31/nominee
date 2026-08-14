# Day-90 retention gate

500 activated developers is a distribution milestone, not proof of fit. The
gate that can tell us to stop is:

> Of the first 100 activated developers, how many still have nominee
> load-bearing at day 90?

Load-bearing means the policy is still evaluating real actions — not that a
package remains installed. An integration that only renders a confirmation
dialog has not exercised the authorization boundary.

## How to read it

| Day-90 retention | Reading | What to do |
| --- | --- | --- |
| **Above 60%** | Fit is real | Turn the W3/W4 crank hard; 500 becomes a matter of execution |
| 30–60% | Ambiguous | Find out where the other half went before spending more on acquisition |
| **Below 30%** | 500 is a vanity target | Stop the distribution spend; the effort belongs back in the product |

Do not estimate a missing number. A confidently wrong retention rate is worse
than an honest gap.

## What this repo can compute

Nominee has no telemetry of its own. Partners and consenting users already
emit privacy-preserving `usageReporter` events to **their** sinks. Export those
events as JSONL (one `AnonymousUsageEvent` per line) and run:

```bash
node scripts/retention-cohort-report.mjs path/to/events.jsonl 2026-08-14
```

The report cohorts by week of first governed action and prints 7 / 28 / 90-day
retention, the allow/fail/deny/expired mix, and expansion from one named
action to two. Retention at day N is “at least one later governed action in
the seven-day window starting at first action + N days.” Incomplete windows
are pending, not zero.

CLI `cli_proof_completed` events are not governed actions and are ignored.

## Decision log

Record the gate here when the first 100 activated developers have completed
the day-90 window. Until then the only honest status is **not yet**.

| Date | Activated principals in export | First-100 day-90 eligible | Retained | Rate | Band | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-14 | 0 | 0 | — | — | not_yet | No partner usage export on file. Public npm downloads are not this metric. |

Acquisition spend that assumes fit should wait for a row with `status: recorded`.
