# Outreach

Send as a person, not as a product. Three sentences, one link, one ask.
Do not attach a deck. Do not claim named customers. Do not say nominee
stops prompt injection.

The Article 14 post is the strongest door-opener we have. Use it only
with teams that have a real oversight or record-keeping problem — not as
a compliance scare.

Replace `[name]`, `[specific write action]`, and `[their post or repo]`.

## 1. Just shipped a write-capable agent

Subject: the `[refund / merge / close-ticket]` tool

```
[Name] — saw [their post or changelog] about the agent that can [specific
write action].

We built nominee for the layer after the model has already decided to call
that tool: allow / ask / deny on the exact arguments, a fresh token only
if it may run, and a receipt either way. It does not detect prompt
injection; it contains what a hijacked call can still do.

If you have 30 minutes this week I can wrap one existing tool in observe
mode on a call — no policy to write first. If that's noise, ignore this.
```

## 2. Article 14 / human oversight

Subject: Article 14 and the tool call, not the model card

```
[Name] — your team will have to show that a human can actually stop a
high-impact agent action, and that you kept a record of what was attempted.

This walkthrough is the pattern we use, including what tamper-evident
receipts do not prove:

https://nominee.dev/blog/eu-ai-act-article-14-human-oversight/

If you already own Auth0/Okta/WorkOS, nominee sits under that rather than
replacing it. Happy to do a 30-minute observe-mode wrap of one real tool
if useful.
```

## 3. MCP server that writes

Subject: OAuth connected; the tool can still run

```
[Name] — [their server] can [write action] once a client is connected.
OAuth answers “is this client allowed to talk to the server.” It does not
answer “may this exact close/commit/refund run.”

nominee-mcp is that second check. Observe mode will inventory the tools
without blocking them; generate writes a starter policy from that traffic.

30 minutes to wrap one handler if you want it. Guide:
https://nominee.dev/docs/mcp/
```

## 4. Auth0 / WorkOS / Clerk ecosystem

Subject: agent tools vs the user who clicked

```
[Name] — you already know who the user is. The gap we keep hitting is the
agent tool that runs later, maybe after a pause, maybe as a sub-agent,
with arguments the IdP never saw.

Short kit for the Auth0 shape (WorkOS FGA / OPA kits exist too):
https://github.com/bharath31/nominee/blob/main/docs/partner-kits/auth0.md

If you have a customer adding a write-capable agent on top of you, I will
do the first policy with them. No co-marketing ask on this mail.
```

## After they reply

- Book a working session, not a pitch. Open their repo or a redacted
  tool list. Run observe if they can.
- If they want a demo of *our* examples, send
  `npx nominee-cli observe` and the playground instead of slides.
- If they go quiet after the first session, that is data. Write it in
  call notes before sending a bump.

## One bump, then stop

```
[Name] — closing the loop. If the write-path agent is still ungated and
you want a second pair of eyes on one tool, I’m around. Otherwise I’ll
assume the timing is wrong.
```
