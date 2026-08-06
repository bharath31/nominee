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

Every committed banner/OG PNG and the injection proof video is the **light
brand** (paper `#faf9f5`), rendered with [Remotion](https://remotion.dev) from
`compositions/` — all of which import `content.ts`, so a positioning change
flows straight into the art.

> ⚠️ **Never rasterize the `*.svg` files.** `site/assets/*.svg` and
> `.github/media/banner*.svg` are STALE DARK (`#0A1020`) orphans from before the
> brand went light — nothing renders from them. Rasterizing them produces dark,
> off-brand banners (this shipped once and had to be reverted). Regenerate with
> Remotion, below.

Compositions (all read `content.ts`; registered in `Root.tsx`):

| Composition | Size | Output |
|---|---|---|
| `BannerMotion` | 1280×400 video | `.github/media/banner-motion.gif` — the older injected-call banner; `banner-motion.png` is a static poster |
| `Banner` | 1600×520 still | `.github/media/banner.png` (static banner, kept for non-animated contexts) |
| `Og` | 1200×630 still | `site/assets/og.png` |
| `PackageBanner` (parameterized) | 1600×520 still | `banner-ai.png` / `banner-eve.png` / `banner-auth0.png` |
| `Injection` | 1280×720 video | the supporting prompt-injection security proof |
| `Proof` | 1280×720 video | the older token-race demo (still true, no longer lead) |

The Remotion project lives outside the workspace to avoid heavy deps in the
monorepo. Scaffold one with `remotion @remotion/cli @remotion/google-fonts
@remotion/renderer react react-dom`, copy `content.ts` + `compositions/*` into
its `src/` (flip the compositions' `../content` import to `./content` for a flat
`src/`), then:

```bash
# stills
npx remotion still  src/index.ts Banner       ../.github/media/banner.png
npx remotion still  src/index.ts Og            ../site/assets/og.png
npx remotion still  src/index.ts BannerAi      ../.github/media/banner-ai.png
npx remotion still  src/index.ts BannerEve     ../.github/media/banner-eve.png
npx remotion still  src/index.ts BannerAuth0   ../.github/media/banner-auth0.png
# animated README header banner (GIF) + static poster
npx remotion render src/index.ts BannerMotion ../.github/media/banner-motion.gif --codec=gif --every-nth-frame=2
npx remotion still  src/index.ts BannerMotion ../.github/media/banner-motion.png --frame=90
# injection video — MP4 for the site, GIF for the README
npx remotion render src/index.ts Injection ../site/assets/nominee-blocked.mp4 --codec=h264
npx remotion still  src/index.ts Injection ../site/assets/nominee-blocked-poster.png --frame=210
npx remotion render src/index.ts Injection ../.github/media/nominee-injection.gif --codec=gif --every-nth-frame=2 --scale=0.7
```

## Surface registry — everywhere positioning copy lives

When the story changes, update `content.ts`, re-render the assets, and walk this list:

| Surface | File | Carries |
|---|---|---|
| README hero + banner alt | `README.md` | tagline, banner alt, problem, layer, when-not, examples |
| README banner image | `.github/media/banner.png` | tagline (rendered) |
| Landing hero | `site/index.html` | tagline (short), analogy, insight |
| Live playground | `site/playground/` | editable support-refund proof using the published package |
| Landing layer + when-not | `site/index.html` (`#why`) | layer diagram, when-not |
| Landing OG image | `site/assets/og.png` | tagline (rendered) |
| Docs intro | `site/docs/index.html` | tagline, when-not, policy/receipts/delegation, freshness explainer |
| Landing FAQ | `site/index.html` (`#faq`) | when-not (verbatim), insight-adjacent objections; kept in sync with the `FAQPage` JSON-LD in `<head>` |
| Blog (insight/launch post) | `site/blog/your-agent-logs-in-as-you/` | insight — live, full prose |
| Blog (launch post) OG image | `site/assets/og-blog-launch.png` (+ `.svg` source) | insight (rendered) |
| Blog (token-freshness post) | `site/blog/oauth-refresh-is-probably-broken/` | the supporting-act token proof, not the lead insight anymore |
| llms.txt (site + root) | `site/llms.txt`, `llms.txt` | tagline, key concepts, when-not |
| Example READMEs | `examples/*/README.md` | scoped framing + when-not |
| Live demo worker | `site/agent-worker/src/index.ts` | supporting security proof — policy block/receipts, freshness, and approval |

> Factual drift (snippets that no longer compile, renamed flags, dead anchors) is
> a separate problem — handle it with `node brand/check-surfaces.mjs` in CI,
> compiled `examples/`, and a link checker, not this file alone.
