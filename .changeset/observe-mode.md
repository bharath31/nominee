---
'nominee': minor
'nominee-cli': minor
'nominee-eve': patch
'nominee-mastra': patch
'nominee-openai': patch
'nominee-postgres': patch
---

Add observe mode: a first-class, report-only mode over your existing tools.

`new Nominee({ mode: 'observe' })` plus `nominee.observe(tools)` needs no
policy and does not enforce deny, ask, or budget decisions. Runtime and
integrity failures still fail closed. Policy verdicts are recorded into the
same hash-chained receipts before execution continues, so you can find out what
an agent actually does before deciding what it should be allowed to do.
`nominee.observations()` returns a JSON report (callbacks that actually started,
argument types and observed ranges, fingerprint-based bounded cardinality,
which arguments are unbounded, and what a policy would have said) without
retaining raw string/boolean values or user IDs. Numeric samples and aggregates
are bounded but can be sensitive. `formatObservations()` prints the report.

Observe mode is a discovery tool, not a security control, and the safety rails
say so: enforcement remains the default, `production: true` refuses to combine
with it, startup emits an unmissable notice that enforcement is off, every
receipt and audit event carries `enforcement: 'observe'` alongside the verdict
the policy actually reached, and delegated sub-agents inherit the mode rather
than choosing it. Input binding, single-use capabilities, and the receipt chain
are unchanged.

`npx nominee-cli observe` demonstrates it on a sample agent, with `--out <file>`
to write the JSON report.
