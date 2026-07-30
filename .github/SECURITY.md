# Security Policy

nominee brokers access tokens and gates privileged actions, so we take security
reports seriously and respond quickly.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub's [private vulnerability reporting](https://github.com/bharath31/nominee/security/advisories/new)
(Security → Report a vulnerability). If you can't use that, email
**security@nominee.dev** with details and we'll coordinate from there.

Please include:

- the affected package(s) and version(s),
- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- any suggested remediation.

## What to expect

- **Acknowledgement** within 3 business days.
- An initial assessment and severity within 7 days.
- A coordinated fix and release, with credit to you (unless you prefer to remain anonymous).

## Supported versions

The latest published minor of each package receives security fixes. Please
upgrade to the most recent release before reporting, and include the exact
version in your report.

## Scope notes

- The **core** package (`nominee`) has zero runtime dependencies; report issues in the engine, token cache, approval engine, or audit here.
- Strategy, store, and adapter packages (`nominee-auth0`, `nominee-postgres`,
  `nominee-ai`, `nominee-eve`, `nominee-openai`, `nominee-mastra`,
  `nominee-mcp`) wrap third-party SDKs/APIs — issues in nominee's handling of
  them are in scope; issues in the upstream provider should also be reported
  to that provider.
- nominee never persists third-party tokens itself; tokens are fetched at call time and cached in memory only. Reports about token handling, leakage in logs/audit, or approval bypass are especially welcome.

## Production-readiness boundaries

- The default memory action and receipt stores are single-process conformance
  implementations. They deliberately advertise `durable = false`.
- Use `production: true` for consequential paths. It refuses to start without
  a default-deny policy, durable action state, an atomic durable receipt
  sequencer, strict receipt delivery, and durable state for provider-native
  approvals. `nominee-postgres` is the reference implementation.
- The action store atomically reserves budgets and consumes each capability
  once. A durable transition journal is written in the same transaction as
  each state change. Receipt sequencing is a separate strict transaction: if
  it fails, execution fails closed, but operators may need to reconcile the
  action journal and receipt stream after an infrastructure incident.
- Hash-chained receipts are an evidence primitive, not durable storage or a
  compliance certification. Protect the signing key and persist receipts in an
  access-controlled append-only system. Anchor signed stream tips outside the
  primary database when the threat model includes an administrator rolling
  back both receipts and their checkpoint.
- Prefer `run()` or `prepareAction()` → `executeCapability()`; they bind the
  policy, resource check, approval, capability, credential, exact input, and
  outcome. Legacy code that calls `authorize()` manually must call
  `await nominee.assertUnchanged(authorization, input)` immediately before
  execution, and is disabled by `production: true`.
- `nominee-auth0` requires a signed, issuer/audience/expiry-verified ID token
  for successful CIBA approval and checks its `sub` against the intended
  approver. Use `PostgresCibaStore` (or another durable `CibaStore`) for
  restart-safe production polling; the default memory store is rejected by
  production mode.
- An in-process wrapper can be bypassed if raw tools or broad credentials remain
  reachable. High-impact deployments should isolate execution and expose only
  decision-bound, least-privilege capabilities to tool code.
