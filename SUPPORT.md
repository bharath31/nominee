# Support

Questions about using nominee belong in **[GitHub Discussions](https://github.com/bharath31/nominee/discussions)**, not the issue tracker.

| Kind | Where |
| --- | --- |
| "How do I…?", design questions, show-and-tell | [Discussions](https://github.com/bharath31/nominee/discussions) |
| Confirmed bug or tightly scoped feature | [Open an issue](https://github.com/bharath31/nominee/issues/new/choose) |
| Security vulnerability | [Private advisory](https://github.com/bharath31/nominee/security/advisories/new) — see [SECURITY.md](.github/SECURITY.md) |

The issue tracker is for defects and work a stranger can pick up. If you are not sure which bucket you are in, start a Discussion; maintainers will promote it to an issue when it is a concrete change.

If Discussions is not visible yet, a repository admin needs to enable it under **Settings → General → Features → Discussions**, then run:

```bash
GH_TOKEN=<token with discussions:write> node scripts/seed-community.mjs
```

or **Actions → Seed community surfaces → Run workflow**. The four thread bodies live in `.github/community/seed.json`. Until that toggle is on, ask in a draft Discussion-style comment on a `good first issue` or wait for the setting.

## Before you ask

- Docs: https://nominee.dev/docs/
- Runnable proof (no signup): `npx nominee-cli`
- Policy lint: `npx nominee-cli check <policy-file>`
- Offline receipt verify: `npx nominee-cli verify <receipts.json>`
- Contributing: [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)

## Seeded threads

If Discussions is newly enabled, start here:

- [What are you guarding?](https://github.com/bharath31/nominee/discussions) — Show and tell
- [Which framework should we adapt next?](https://github.com/bharath31/nominee/discussions) — Ideas
- [Q&A: binding an approval to exact tool arguments](https://github.com/bharath31/nominee/discussions) — Q&A
