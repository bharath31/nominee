# Design partners

GitHub [#52](https://github.com/bharath31/nominee/issues/52) asked for ten
narrow design partners. Linear [NOM-16](https://linear.app/brth31/issue/NOM-16)
owns the same work. An agent can source, draft, research, and track. A human
has to be on the calls. This directory is the agent half.

**This is not a partner list.** Zero named users exist. Do not write as if
they do. Case studies stay empty until a partner supplies numbers and written
sign-off — see [docs/case-studies](../case-studies/README.md).

## What “recruited” means

A row in [pipeline.md](pipeline.md) counts only when all of these are true:

1. The team matches the ICP in [scorecard.md](scorecard.md). Six inside the
   ICP beat ten outside it.
2. A named engineer agreed to a working session (not a polite “looks cool”).
3. They have **one real policy enforcing one real tool in a real environment**
   — not a clone of `examples/`.
4. Structured notes exist in `docs/design-partners/notes/<slug>.md` (copy
   [call-notes.md](call-notes.md)). The field that matters is **where they
   stopped**, not what they said they liked.

Three of the ten must later consent to a public case study. That consent is
separate from recruitment.

## What a partner gets

Direct access, fast fixes, influence over the next policy/console gap, and
help wiring the first policy (`observe` → `generate` → `check` → enforce).
What we get: where nominee actually breaks, and eventually a case study.

## What a partner does not get

A promise that nominee is a compliance certification, a prompt-injection
detector, or a replacement for Auth0 / WorkOS / OPA / Arcade. Use the
partner kits in `docs/partner-kits/` when those products are already in the
stack.

## Cadence

- **Weekly (human, 30 min):** walk [pipeline.md](pipeline.md). Move rows.
  Send the next three emails from [outreach.md](outreach.md). Do not batch
  a month of cold mail.
- **After every call:** fill call notes the same day. If they went quiet,
  write that as the finding.
- **When a policy is live:** start a case-study draft from
  [TEMPLATE.md](../case-studies/TEMPLATE.md). Leave it unpublished.

## Files

| File | Purpose |
| --- | --- |
| [scorecard.md](scorecard.md) | ICP yes/no. Fail closed. |
| [outreach.md](outreach.md) | Paste-ready mail. Article 14 is the door-opener. |
| [sourcing.md](sourcing.md) | Where to look. No scraped contact dump. |
| [pipeline.md](pipeline.md) | Ten slots. Empty on purpose. |
| [call-notes.md](call-notes.md) | Template for `notes/<slug>.md`. |
