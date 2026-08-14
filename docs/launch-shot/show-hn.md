# Show HN — draft, do not post

Post only after [README.md](README.md) gates are all checked.

## Title

Show HN: nominee – observe what an agent can do, then allow/ask/deny the tool

Keep “Show HN:” and stay specific. Do not use “stops prompt injection.”

## Body

```
Building an agent that can change real data? nominee is an authorization
layer for the tool call, not the model.

Wrap existing tools in observe mode. Nothing is blocked. You get a report
of what actually ran (shapes and numeric ranges, not raw string dumps),
then a starter policy file from that traffic. After that, allow / ask /
deny runs before the side effect. Denied calls never execute. Approvals
bind the exact arguments. Credentials resolve at execution time.

It does not detect prompt injection. The supporting demo hijacks the
“model” on purpose; the forward-to-attacker tool still does not run.
That is blast-radius containment.

In-process wrapping is not isolation. If model-controlled code can import
the raw tool or the root credential, it can bypass nominee. High-impact
tools belong in a separate execution service.

No named customers yet. Case studies will wait for partner numbers.

https://nominee.dev
https://github.com/bharath31/nominee
npx nominee-cli observe
```

## First-comment replies (paste, then go back to being present)

### Why not just an `if`?

Approvals that outlive the request, budgets across workers, a permission
that changed while the agent was paused, one policy across AI SDK / MCP /
OpenAI Agents / Mastra. Those are month-six reasons. Minute three is
observe mode: you may not need nominee; the report will say so.

### Does this stop prompt injection?

No. The model can still be hijacked. The denied tool still does not run.
See `examples/prompt-injection-blocked`.

### Who is using this?

Nobody we can name. That is the honest answer until design partners have
a live policy and consent to a study.

### Is this production-ready?

`production: true` refuses to start without default-deny, durable action
and receipt stores, and strict delivery. The playground is not that.
`nominee-postgres` is the store we ship for the durable path. Isolation
is still your job — see the wrapping caveat in the post.
