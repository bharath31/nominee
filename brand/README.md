# brand/ — single source of truth for positioning + visual assets

`content.ts` holds nominee's canonical positioning copy (tagline, subhead, the
insight, the layer diagram, "when you don't need it", URLs, colors). The goal:
**a positioning change is one edit here, fanned out to every surface** — instead
of hand-editing a dozen files and missing three.

## How it's used

- **Visual assets** (`compositions/*.tsx`) import `content.ts` directly and are
  rendered with [Remotion](https://remotion.dev) into the committed PNGs/MP4/GIF.
  Re-render after a copy change; the assets can't drift from the source.
- **Static surfaces** (`.md`, `.html`, `.txt`) can't import TS, so they're kept
  in sync by hand against `content.ts`. The registry below is the checklist.

## Rendering the assets

The Remotion project lives outside the workspace to avoid adding heavy deps to
the monorepo. From a Remotion project that imports `../brand/content.ts`:

```bash
# stills
npx remotion still compositions/Banner.tsx  ../.github/media/banner.png
npx remotion still compositions/Og.tsx       ../site/assets/og.png
# video (then convert to gif if needed)
npx remotion render compositions/Proof.tsx   ../site/assets/nominee-proof.mp4
```

See `compositions/` for the composition source. `Og.tsx` and `Banner.tsx`
already read `brand.taglineFull` / `brand.subhead` dynamically — they were
correct the moment `content.ts` was, the *render step* was just never run
after the authorization pivot. `Proof.tsx` renders the token-race video only;
there is no composition yet for a policy-blocked-exfiltration video or for
per-package/blog OG images (those are hand-authored SVGs, see below).

**Fallback used for the authorization pivot (no Remotion project on hand):**
`site/assets/*.svg` and `.github/media/banner*.svg` are plain, hand-editable
SVGs — the actual committed PNGs are lossless rasterizations of them, not
Remotion output. Edit the SVG text directly to match `content.ts`, then
rasterize with `sharp` (already a transitive dep in this workspace) rather
than standing up Remotion for a one-off:

```js
const sharp = require('sharp') // resolve via node_modules/.pnpm/sharp@*/node_modules/sharp if not hoisted
await sharp(svgBuffer, { density: 300 }) // supersample for crisp text, then...
  .resize(targetWidth, targetHeight, { fit: 'fill' }) // ...downscale to an exact target (only distortion-free if target keeps the SVG's own aspect ratio)
  .png()
  .toFile(outPath)
```

Package banners (`banner-ai.svg`, `banner-eve.svg`, `banner-auth0.svg`) and
blog OG images (`og-blog-token.svg`, `og-blog-launch.svg`) were never Remotion
compositions to begin with — they're hand-authored SVGs edited the same way.
`banner-auth0.svg` still accurately describes `nominee-auth0` (Token Vault +
CIBA) and was left untouched by the pivot.

**Not regenerated in the pivot:** a video/GIF proof of the policy-blocked
exfiltration story (the `#how` section on the homepage still shows the older
`nominee-proof.mp4` token race — real and still true, just not the lead demo
anymore). Needs either a new Remotion composition + a real render environment,
or a screen recording of `examples/prompt-injection-blocked`.

## Surface registry — everywhere positioning copy lives

When the story changes, update `content.ts`, re-render the assets, and walk this list:

| Surface | File | Carries |
|---|---|---|
| README hero + banner alt | `README.md` | tagline, banner alt, problem, layer, when-not, examples |
| README banner image | `.github/media/banner.png` | tagline (rendered) |
| Landing hero | `site/index.html` | tagline (short), subhead, insight |
| Landing layer + when-not | `site/index.html` (`#why`) | layer diagram, when-not |
| Landing OG image | `site/assets/og.png` | tagline (rendered) |
| Docs intro | `site/docs/index.html` | tagline, when-not, policy/receipts/delegation, freshness explainer |
| Landing FAQ | `site/index.html` (`#faq`) | when-not (verbatim), insight-adjacent objections; kept in sync with the `FAQPage` JSON-LD in `<head>` |
| Blog (insight/launch post) | `site/blog/your-agent-logs-in-as-you/` | insight — **shell only as of the pivot; prose drafts in bat-os queue, do not deploy with placeholders still in place** |
| Blog (launch post) OG image | `site/assets/og-blog-launch.png` (+ `.svg` source) | insight (rendered) |
| Blog (token-freshness post) | `site/blog/oauth-refresh-is-probably-broken/` | the supporting-act token proof, not the lead insight anymore |
| llms.txt (site + root) | `site/llms.txt`, `llms.txt` | tagline, key concepts, when-not |
| Example READMEs | `examples/*/README.md` | scoped framing + when-not |
| Live demo worker | `site/agent-worker/src/index.ts` | demo copy — policy block/receipts (lead), freshness/approval (supporting act) |

> Factual drift (snippets that no longer compile, renamed flags, dead anchors) is
> a separate problem — handle it with compiled `examples/` + a CI link checker,
> not this file.
