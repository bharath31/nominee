# Case studies

Case studies are the only artifact that answers *does this work for someone who
isn't the author?* They are gated on design partners. This directory holds the
template and the sign-off log. It does **not** invent named-company stories.

## Hard rules

- No case study without the partner's numbers.
- Explicit written sign-off before anything with a company name (or a named
  team) is published.
- Each published study must include: what they did before, what nominee caught
  (ideally from observe mode), adoption cost including friction, and one thing
  they still want fixed.
- Engineer-to-engineer. Real policy code if they allow it. No executive pull
  quotes, no logo wall, no “transformed our business.”
- A vague study is worse than none.

## Status

| Slot | Partner | Numbers | Sign-off | Published URL |
| --- | --- | --- | --- | --- |
| 1 | — | waiting | — | — |
| 2 | — | waiting | — | — |
| 3 | — | waiting | — | — |

Until a row has numbers and sign-off, the public page at
https://nominee.dev/case-studies/ says so. Repository proofs (CLI refund,
injection containment, token refresh) are **not** case studies; they live in
`examples/` and may be linked as runnable evidence.

## When a partner is ready

1. Copy [TEMPLATE.md](TEMPLATE.md) to `docs/case-studies/<slug>.md`.
2. Fill every required section. If a number is missing, write “not measured”
   rather than an estimate.
3. File written sign-off (email or letter) path in the status table.
4. Publish the HTML page under `site/case-studies/<slug>/` and link it from
   README, the landing page, and every live Phase 2 placement.
