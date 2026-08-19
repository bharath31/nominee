---
"nominee": major
---

Receipt delivery is now **strict by default**, and the policy budget option was
renamed to `maxCalls`. Both are breaking changes bundled into this release.

## `receipts.delivery` defaults to `'strict'`

Previously the default was `'buffered'`: a receipt sink that threw or rejected
latched a flag and the tool still ran, with the audit silently lost. For a
product whose differentiator is evidence, that is a security bug. Now:

- A sink that throws or rejects **fails the call** — the tool does not run with
  its audit lost.
- Pass `delivery: 'buffered'` explicitly to restore the legacy best-effort
  behaviour (a failing sink defers the error to `flushReceipts()`; treat a
  rejecting flush as lost audit evidence). `production: true` refuses
  `'buffered'`.
- `nominee.verifyReceipts()` is now **async** and, when an atomic receipt store
  is configured, verifies the durable stream together with the in-process
  window — a production instance never gets a vacuous `{ ok: true, checked: 0 }`.

## `max` is renamed to `maxCalls`

`allow('refund.issue', { max: 20 })` counts **calls**, not spend, with no time
window and no reset. The name invited the wrong reading. The option is now
`maxCalls`; the deprecated `max` alias keeps working (one warning per process)
and setting both throws. Durable budget counters are unaffected by the rename.
