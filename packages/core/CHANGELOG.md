# nominee

## 1.0.0

### Minor Changes

- f1593cf: Approval requests passed to `onApprovalRequest` now carry `approve()`, `deny()`, and `resolve(decision)` methods, so you can settle them inline without capturing the `Nominee` instance (no more self-reference / type-annotation dance). `resolveApproval(id, decision)` still works.
- Add single-flight refresh coalescing and `invalidate()`.

  `token()` now deduplicates concurrent cache-miss calls — N parallel calls share one fetch instead of stampeding the token endpoint. The in-flight promise map is cleaned up in `finally` so a failed refresh never blocks the next attempt.

  `invalidate(user, connection)` drops the cached entry and emits a `token.invalidated` audit event. Use it when a token is known-bad (e.g. a 401 came back from the API) to force a fresh fetch on the next `token()` call.
