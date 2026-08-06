# Security review checklist

Independent traceability from the concrete guarantee statements in
[`.github/SECURITY.md`](../.github/SECURITY.md), [`docs/production.md`](production.md),
and [`README.md`](../README.md) to the tests that prove them. Reviewed 2026-08-06.

Method: every claim below was matched to a test in `packages/core/test/` or the
`security-contract/contract.test.ts` suite referenced by `docs/open-issue-triage.md`.
Where a claim is specific to an adapter package (`nominee-auth0`, `nominee-postgres`),
the corresponding package test is cited instead, since no core test can exercise it.
All cited suites were actually run on this date:

```
pnpm --filter nominee test           # 14 files, 136 tests passed
pnpm --filter security-contract test # 1 file, 5 tests passed
pnpm --filter nominee-auth0 test     # 2 files, 16 tests passed
pnpm --filter nominee-postgres test  # 1 file, 4 tests passed
```

`security-contract` is not currently listed in `pnpm-workspace.yaml`; it was run by
temporarily adding it to the workspace and reverted afterward. It is otherwise
excluded from `pnpm -r test`.

## Claim traceability

| Claim | Test that verifies it | File:line | Pass/Fail |
|---|---|---|---|
| Denied calls throw before the tool runs: `PolicyDeniedError` **before the tool runs** (README.md:81) | `deny-before-execute: denied operations throw before execution` | `security-contract/contract.test.ts:34` | Pass |
| Denied calls never run the underlying wrapped function | `never runs the underlying tool on deny` | `packages/core/test/authorize.test.ts:198` | Pass |
| Denied or expired actions never run, and the refusal is on the record (README.md:156) | `never runs the underlying tool on deny` + `expires after the timeout` | `packages/core/test/authorize.test.ts:198`, `packages/core/test/approval.test.ts:40` | Pass |
| Approval/exact-call binding: execution refuses if arguments changed while approval was pending | `approval/input binding: input mutation after approval throws AuthorizationInputChangedError` | `security-contract/contract.test.ts:44` | Pass |
| `guard()`/`run()` refuse execution when tool input changed after authorization | `never runs with input changed while approval was pending` | `packages/core/test/authorize.test.ts:206` | Pass |
| Decision-bound `run()` rejects tool input changed after policy evaluation | `rejects tool input changed after policy evaluation` | `packages/core/test/action.test.ts:142` | Pass |
| A capability is single-use: expires after one execution (production.md:100-101, SECURITY.md:52-53) | `capability single-use: capability expires after execution` | `security-contract/contract.test.ts:68` | Pass |
| A single-use capability executes exactly once under concurrent attempts | `executes a single-use capability exactly once under concurrency` | `packages/core/test/action.test.ts:114` | Pass |
| A durable (Postgres) capability is invalidated after one successful consumption | `invalidates a capability after one successful consumption` | `packages/postgres/test/postgres.test.ts:94` | Pass |
| Resource permission is rechecked after any pause, immediately before execution (README.md:45, production.md:86-89) | `rechecks resource authorization after approval and before execution` | `packages/core/test/action.test.ts:78` | Pass |
| Delegation can only narrow: strictest outcome wins (deny > ask > allow); a sub-agent can never allow what its parent denies (README.md:124) | `strictest outcome wins across a delegation chain` + `ask beats allow, deny beats ask in a chain` | `packages/core/test/policy.test.ts:162`, `packages/core/test/policy.test.ts:176` | Pass |
| Delegation narrowing holds at the `Nominee` level, and the receipt chain records the delegation path | `sub-agents can only narrow authority, and share the receipt chain` | `packages/core/test/authorize.test.ts:312` | Pass |
| A sub-agent shares the parent's token cache (delegation does not force redundant credential fetches) | `a sub-agent shares the parent cache (no refetch)` | `packages/core/test/delegation.test.ts:41` | Pass |
| First match wins within a policy; rules are checked in order (README.md:119) | `first matching rule wins` | `packages/core/test/policy.test.ts:32` | Pass |
| No match falls back to the configured `fallback` (default `'ask'`, `'deny'` for default-deny) (README.md:120) | `falls back to ask by default, honors explicit fallback` | `packages/core/test/policy.test.ts:40` | Pass |
| Budgets: the call past `max` escalates to a human instead of silently failing (README.md:123, SECURITY.md:52-53) | `escalates an exhausted allow budget to ask` | `packages/core/test/policy.test.ts:110` | Pass |
| Budget/capability reservations are atomic under concurrency ("atomically reserves budgets", SECURITY.md:52-53) | `commits allow budgets atomically across concurrent calls` + `atomic budgets: exhausted budget escalates or denies` | `packages/core/test/policy.test.ts:119`, `security-contract/contract.test.ts:102` | Pass |
| A durable transition journal is written in the same transaction as each action state change (SECURITY.md:53-54) | `runs a production action with durable state and receipts` (asserts `nominee_action_events` rows for every lifecycle transition) | `packages/postgres/test/postgres.test.ts:28` | Pass |
| A shared durable budget is enforced across independent `Nominee` instances (production.md, SECURITY.md:52-53) | `enforces a shared budget across independent production instances` | `packages/postgres/test/postgres.test.ts:69` | Pass |
| `nominee.check()` previews a decision without consuming budgets or triggering an approval request (README.md:133-137) | `check() previews without consuming budgets or asking anyone` | `packages/core/test/authorize.test.ts:97` | Pass |
| Hash-chained receipts: editing or deleting any record breaks verification of everything after it (README.md:168) | `detects content tampering` + `detects deletion and reordering` | `packages/core/test/receipt.test.ts:23`, `packages/core/test/receipt.test.ts:39` | Pass |
| Tamper detection identifies the exact broken index (`brokenAt`), not just "invalid" (README.md:110, README.md:187) | `detects content tampering` (asserts `result.brokenAt === 1`) | `packages/core/test/receipt.test.ts:23` | Pass |
| Tamper detection holds across a resumed receipt stream / checkpoint (production.md "Known boundary" adjacency) | `detects tampering across a resume checkpoint` | `packages/core/test/receipt.test.ts:155` | Pass |
| Receipt-tail truncation is detected against the durable transactional stream checkpoint (production.md:114-117) | `detects receipt-tail truncation against the transactional stream checkpoint` | `packages/postgres/test/postgres.test.ts:116` | Pass |
| Receipts record `inputHash` by default and never store raw input unless `input: 'raw'` is opted in (README.md:190) | `hashes input by default, never storing it` + `supports raw and none input modes` | `packages/core/test/receipt.test.ts:51`, `packages/core/test/receipt.test.ts:63` | Pass |
| Receipts can be HMAC-signed; verification fails without the correct key (README.md, "optional HMAC signing") | `signs with an HMAC key so verification needs the key` | `packages/core/test/receipt.test.ts:73` | Pass |
| In-memory receipts retain the latest 1,000 entries by default; `retain: 'all'` / `onReceipt` give an unbounded history (README.md:191) | `bounds retained in-memory receipts while preserving the visible chain window` | `packages/core/test/receipt.test.ts:172` | Pass |
| Strict receipt delivery fails execution closed if the sink fails (README.md "delivery: 'strict'", SECURITY.md:54-56) | `fails closed when strict receipt delivery fails` | `packages/core/test/authorize.test.ts:155` | Pass |
| Execution does not proceed when pre-execution receipt evidence cannot be persisted | `does not execute when required pre-execution evidence cannot be persisted` | `packages/core/test/action.test.ts:402` | Pass |
| A committed side effect whose success evidence fails to persist is reported, not silently dropped | `reports a committed side effect whose success evidence could not be persisted` | `packages/core/test/action.test.ts:434` | Pass |
| `production: true` refuses to start without a default-deny policy, durable action store, atomic durable receipt store, and strict receipt delivery (README.md:308-310, SECURITY.md:48-51) | `requires durable control-plane primitives in production mode` + `requires an actual deny fallback and preserves production mode through delegation` | `packages/core/test/action.test.ts:327`, `packages/core/test/action.test.ts:349` | Pass |
| The default in-memory action/receipt stores are non-durable and are rejected by `production: true` (SECURITY.md:46-47, README.md:200) | `requires durable control-plane primitives in production mode` (throws using the real, un-proxied `MemoryActionStore`/`MemoryAtomicReceiptStore`) | `packages/core/test/action.test.ts:327` | Pass |
| Production mode is preserved through delegation; a delegated child cannot use non-decision-bound `authorize()`/`token()` | `requires an actual deny fallback and preserves production mode through delegation` | `packages/core/test/action.test.ts:349` | Pass |
| `nominee-auth0` requires a signed, issuer/audience/expiry-verified ID token for CIBA approval | `fails closed when approval has no verified ID token` | `packages/auth0/test/auth0.test.ts:256` | Pass |
| `nominee-auth0` checks the ID token's `sub` against the intended approver | `rejects a valid token from the wrong approver` | `packages/auth0/test/auth0.test.ts:279` | Pass |
| `PostgresCibaStore` gives restart-safe, durable CIBA approval polling (production.md:97-99, SECURITY.md:70-72) | `persists resumable approval state in PostgreSQL` | `packages/auth0/test/auth0.test.ts:216` | Pass |
| Token strategy resolution coalesces concurrent refreshes into one fetch (single-flight) (README.md:226) | `coalesces concurrent refreshes into one fetch (single-flight)` | `packages/core/test/token.test.ts:116` | Pass |
| A rotated `refresh_token` is persisted via `onRefreshToken` and used on the next cycle (README.md "rotation persistence") | `persists the rotated refresh_token via onRefreshToken and uses it next cycle` | `packages/core/test/oauth2.test.ts:81` | Pass |
| `nominee never persists third-party tokens itself; ... cached in memory only` (SECURITY.md:41) | `returns a token from the strategy` + `caches tokens with a known expiry and reuses them` (no persistence path exercised; strategy is the only source of truth) | `packages/core/test/token.test.ts:6`, `packages/core/test/token.test.ts:11` | Pass |

## Uncovered claims

These are concrete guarantee statements found in the three reviewed documents with
no covering test in `packages/core/test/`, `security-contract/`, or the relevant
adapter package's test directory as of this review. None of these were turned into
new tests, per this task's scope — they are reported here instead.

- **`nominee.assertUnchanged(authorization, input)` itself is never exercised by any test.**
  SECURITY.md:64-66 states: "Legacy code that calls `authorize()` manually must call
  `await nominee.assertUnchanged(authorization, input)` immediately before execution."
  `grep -rn "assertUnchanged"` across every `test/` directory in the repo returns only
  the function's definition (`packages/core/src/nominee.ts:476`) — zero call sites in
  any test. The *behavior* it implements (execution refuses on input drift) is well
  covered through the `guard()`/`run()` path (`packages/core/test/authorize.test.ts:206`,
  `security-contract/contract.test.ts:44`), but those paths do not call
  `assertUnchanged()` directly (they inline the same check inside `run()`), so the
  documented manual-`authorize()` API surface itself is untested.

- **"the default memory store is rejected by production mode" for `nominee-auth0` CIBA
  (SECURITY.md:71-72) has no covering test, even though the enforcement code exists.**
  `Nominee`'s `production: true` constructor check
  (`packages/core/src/nominee.ts:333-335`) rejects construction when
  `strategy.startApproval` is set but `strategy.durableApprovals` is falsy. `Auth0()`
  wires that flag to `cibaStore.durable` whenever `options.ciba` is configured
  (`packages/auth0/src/index.ts:527`), and the default `MemoryCibaStore` reports
  `durable = false` (`packages/auth0/src/index.ts:132`) while `PostgresCibaStore`
  reports `durable = true` (`packages/auth0/src/index.ts:180`) — so the mechanism is
  real. No test exercises it end-to-end, though: `grep -rn "production"
  packages/auth0/src/*.ts` finds the enforcement only indirectly (there is no
  `production` string in that package — the check lives entirely in core), and no
  test in `packages/core/test/` or `packages/auth0/test/` constructs a
  `production: true` `Nominee` with an Auth0 CIBA strategy (default or durable store)
  to assert the throw/no-throw behavior, either exercising core's generic
  `durableApprovals` gate or `nominee-auth0`'s wiring of it. (An adjacent non-goal
  note was added next to this
  claim in `.github/SECURITY.md` clarifying that the gate lives in `Nominee`'s
  constructor, not in `nominee-auth0` itself.)

- **"Never log capability bearers, access tokens, CIBA ID tokens, or raw tool inputs"
  (production.md:124-125) has no automated test.** This is operator guidance about
  application-level logging that nominee cannot enforce from inside the library, so a
  unit test proving it is largely out of reach — but no test in `packages/core/test/`
  asserts that a receipt, error message, or audit event never carries a raw capability
  string or bearer token either, which would at least cover nominee's own surfaces.

- **The comparative "naive refresh breaks under rotation + concurrency (7/8 fail;
  nominee 8/8)" proof (README.md:247) is not an asserting test.**
  `examples/token-refresh-correctness/run.mjs` prints the four scenarios (A-D) to
  stdout with no `expect()`/exit-code check — it is a runnable demo, not a test that
  can fail a CI run if the guarantee regresses. The underlying single-flight
  primitive it demonstrates *is* covered by an asserting test
  (`packages/core/test/token.test.ts:116`), but the specific 7/8-vs-8/8 comparison in
  the README is not.

No other claim searched in `.github/SECURITY.md`, `docs/production.md`, or
`README.md` was found without a covering test. The search was exhaustive across
concrete guarantee statements (not architectural descriptions, install instructions,
or purely operational runbook steps like "rotate the key" or "alert on X", which are
not testable assertions about nominee's own behavior).

## Non-goal additions

Three adjacent "what this does NOT protect against" notes were added to
`.github/SECURITY.md`, next to claims that previously lacked one (two in
"Production-readiness boundaries", one in "Scope notes"):

- Next to the `assertUnchanged()` bullet ("Production-readiness boundaries"):
  manual `authorize()` callers who skip or ignore `assertUnchanged()` outside
  `production: true` are not protected — the binding is opt-in on that path.
- Next to the `nominee-auth0` CIBA bullet ("Production-readiness boundaries"):
  `production: true` does not itself validate or reject the strategy's
  `CibaStore` choice — see the uncovered-claim finding above.
- Next to the token-persistence bullet ("Scope notes"): memory-only caching
  bounds token exposure to the process and the token's lifetime, it does not
  eliminate exposure within that window.
