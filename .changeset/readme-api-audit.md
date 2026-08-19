---
"nominee": patch
---

Fix the README "Full API" blocks: `onGovernedAction` is a constructor
option, not a method — it is now documented where it actually is, and
`nominee.receipts` is called out as a getter, not a method.
`brand/check-surfaces.mjs` now verifies every `nominee.<member>` named in
the two README API blocks against the built `Nominee` class.