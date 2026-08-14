# Product Hunt — draft, do not post

Secondary to Show HN. Lower-quality traffic for developer infrastructure,
cheap to do the same day **after** the three gates in
[README.md](README.md).

## Name

nominee

## Tagline (≤60 characters)

See what your agent can do, then authorize the tool call

## Description

```
nominee is an authorization layer for AI agent tool calls.

Observe mode wraps the tools you already have. It does not enforce deny
or ask. It reports what actually ran. Generate writes a starter policy
from that traffic. Then allow / ask / deny runs before the side effect.

It does not detect prompt injection. It contains the blast radius of a
hijacked call: the denied tool never executes, and the attempt is on a
hash-chained receipt log.

Not a connector catalog, not an IdP, not a replacement for Vercel AI SDK
approvals. Use those when they cover the whole boundary.
```

## First comment (maker)

Lead with observe → generated policy. Link the MCP quickstart second.
State the wrapping caveat and that there are no named customers yet.

Do not upload a logo wall of companies that are not partners.
