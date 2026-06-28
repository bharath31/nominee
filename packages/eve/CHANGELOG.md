# nominee-eve

## 2.0.2

### Patch Changes

- Release 2.0.2 to realign all packages on one clean, publishable version.

  `nominee@2.0.1` and `nominee-supabase@2.0.1` published successfully, but
  `nominee-ai`, `nominee-eve`, and `nominee-auth0` had **both 2.0.0 and 2.0.1
  burned** on npm (published then unpublished earlier — npm permanently retires
  those exact version numbers, so `changeset publish` keeps getting "cannot
  publish over previously published version"). 2.0.2 is unused for every package,
  so it publishes cleanly and brings the whole linked group back in lockstep.

- Updated dependencies
  - nominee@2.0.2

## 2.0.1

### Patch Changes

- Release 2.0.1 and fix unintended major version bumps.

  Two things in one release:

  1. **Unblock publishing.** The `2.0.0` version number was burned on npm for
     `nominee-ai`, `nominee-eve`, and `nominee-auth0` (published then unpublished
     on 2026-06-20), so npm permanently rejects republishing it and the Release
     workflow stayed red. Bumping to `2.0.1` publishes a fresh, clean version.

  2. **Fix the versioning.** `2.0.0` itself was an _accident_: a single
     `nominee-auth0: minor` changeset got escalated to a whole-group **major** by
     changesets' `fixed`-group behavior. The config now uses `linked` instead of
     `fixed`, so the packages still share a version line but a `minor` changeset
     bumps a minor and a `patch` bumps a patch — no surprise majors.

- Updated dependencies
  - nominee@2.0.1

## 2.0.0

### Patch Changes

- nominee@2.0.0

## 1.1.0

### Patch Changes

- Updated dependencies
  - nominee@1.1.0

## 1.0.0

### Patch Changes

- Updated dependencies [f1593cf]
- Updated dependencies
  - nominee@1.0.0
