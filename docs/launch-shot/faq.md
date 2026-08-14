# Launch FAQ

Paste-ready. Keep every caveat. Source:
[docs/positioning.md](../positioning.md),
[docs/production.md](../production.md) “Known boundary”.

## Why not just an `if`?

An `if` in the tool handler does not survive a pause that outlives the
request, does not share a budget across workers, does not re-check a
resource permission that changed while the agent was waiting, and does
not give you one policy across frameworks. nominee’s decision-bound path
binds the exact arguments, issues a short-lived one-shot capability, and
records denials as well as approvals.

If your agent is a single process, a single framework, and a single
request, you might only need the framework’s `needsApproval`. That is a
legitimate outcome of observe mode.

## Security boundary (volunteer this)

Nominee does not isolate code by itself. If model-controlled code can
import the raw tool or read the root credential, it can bypass an
in-process wrapper. Put high-impact tools in a separate execution
service and expose only the decision-bound call path.

## Prompt injection

Prohibited claim: “stops prompt injection.” Honest claim: the model can
be hijacked and the exfiltration still does not execute when the policy
denies the tool. Demo: `examples/prompt-injection-blocked`.

## Tamper-evident vs tamper-proof

Receipts are a hash chain. An edit fails verification of a chain whose
earlier hashes you already trust. Someone who holds the HMAC key and
write access can still seal a replacement chain. That is a key-management
problem. Do not call this a certification.

## Scale and production

`production: true` is fail-closed construction: default-deny policy,
durable action store, atomic durable receipt store, `delivery: 'strict'`.
In-memory stores refuse that flag. Multi-replica: `nominee-postgres`.

## Who is using it?

No named teams. Design-partner pipeline:
[docs/design-partners/pipeline.md](../design-partners/pipeline.md).
Until a case study has partner-supplied numbers and sign-off, the public
page says none are published.
