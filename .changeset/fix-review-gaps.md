---
"nominee": patch
"nominee-ai": patch
"nominee-cli": patch
---

Post-merge review fixes for the Wave-1 credibility PRs:

- **CI actually runs the API-surface gate now.** `ci.yml` builds before
  `brand/check-surfaces.mjs`, and the check fails in CI when
  `packages/core/dist` is absent instead of silently skipping — so a
  reintroduced phantom method like `nominee.onGovernedAction()` fails the
  pipeline, as the README audit intended.
- **`guardTools` documents its token boundary.** `connection` / `scopes`
  on the one-liner are forwarded to the strategy's `getToken`, stored on the
  action, and recorded on the receipt chain — but the wrapped tool's plain
  `execute` never receives the token; use `nomineeTool` when the tool itself
  must call the third-party API, and note that `connection` on a
  policy-only nominee fails closed at call time.
- **`guardTools` gets coverage for static `tenant` / `resource` values,
  `ActionPendingError` when an ask outlives the request, and
  `AuthorizationInputChangedError` when input mutates after approval.**
- **The CLI pause proof tightens its arg-swap criterion** to count only
  `AuthorizationInputChangedError` — proof that the approval is bound to
  the exact approved input, not a looser consumed-capability error.
- **`packages/core/README.md` Full API block gains `assertUnchanged`,
  `observe()`, and `observations()`.**
