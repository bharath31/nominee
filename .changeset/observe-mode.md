---
'nominee': minor
'nominee-cli': minor
---

Add observe mode: a first-class, report-only mode over your existing tools.

`new Nominee({ mode: 'observe' })` plus `nominee.observe(tools)` needs no
policy and blocks nothing. Policy verdicts — including denies and asks — are
recorded into the same hash-chained receipts and then the call runs, so you can
find out what an agent actually does before deciding what it should be allowed
to do. `nominee.observations()` returns a JSON report (tools, call counts,
argument types and observed ranges, which arguments are unbounded, what a
policy would have said) and `formatObservations()` prints it.

Observe mode is a discovery tool, not a security control, and the safety rails
say so: enforcement remains the default, `production: true` refuses to combine
with it, startup emits an unmissable notice that enforcement is off, every
receipt and audit event carries `enforcement: 'observe'` alongside the verdict
the policy actually reached, and delegated sub-agents inherit the mode rather
than choosing it. Input binding, single-use capabilities, and the receipt chain
are unchanged.

`npx nominee-cli observe` demonstrates it on a sample agent, with `--out <file>`
to write the JSON report.
