---
"nominee": minor
---

Seal receipt schema version `v: 1` into every new receipt hash. `verifyReceipts` still accepts unversioned legacy records and mixed chains, and fails closed on an unknown `v`.
