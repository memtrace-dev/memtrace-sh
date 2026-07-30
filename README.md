# varve.sh

Marketing site for [varve](https://github.com/varve-sh/varve), decision memory for AI coding agents.

**Live:** [varve.sh](https://varve.sh)

## Stack

- [Astro 6](https://astro.build), static output
- [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite`, tokens in `src/styles/global.css`
- Canvas 2D "strata engine" (`src/scripts/strata.ts`), the page's one visual idea
- [GSAP](https://gsap.com) + ScrollTrigger for the pinned lifecycle pan and scroll reveals
- [Lenis](https://lenis.darkroom.engineering) for smooth scrolling
- [Geist](https://vercel.com/font) + Geist Mono, self-hosted through Fontsource
- [Phosphor](https://phosphoricons.com) icons, regular weight
- GitHub Releases API, read at build time for version and download links

## Development

```sh
nvm use           # Node 24, see .nvmrc
npm install
npm run dev       # http://localhost:4321
npm run build     # output to ./dist
npm run preview
```

Requires Node >= 22.12.

## Structure

```
src/
├── components/
│   ├── StrataCanvas.astro the record: one fixed canvas behind the page
│   ├── Nav.astro          navigation, theme toggle
│   ├── Hero.astro         headline, install, and the legend to the record
│   ├── Model.astro        decisions vs notes, memory_pack output
│   ├── Lifecycle.astro    pinned horizontal pan through the states
│   ├── Record.astro       the event chain and varve report
│   ├── Surface.astro      the eight MCP tools, agent logos
│   ├── Install.astro      install paths and release downloads
│   ├── Terminal.astro     shared terminal shell and copy button
│   ├── Logo.astro         the mark, animatable bars
│   └── Footer.astro
├── layouts/Layout.astro   head, SEO, JSON-LD, motion bootstrap
├── pages/index.astro
├── scripts/strata.ts      the strata engine
└── styles/global.css      palette, tokens, reveal primitives
```

## Design tokens

The palette is fixed: black `#111111`, bone `#F6F4EE`, burnt ochre `#B86A2F`
(primary accent), clay `#8E5530` (hover). Contrast was measured rather than
guessed, and two results drive the component styles:

- Ochre fills always take **black** labels (4.62:1). Bone on ochre fails at 3.71:1.
- Accent **text** is clay in light mode (5.47:1) and ochre in dark mode (4.62:1).

Both themes ship. The mode follows `prefers-color-scheme` and is overridable by
the toggle, which persists to `localStorage` under `theme`.

## Motion

Every animation is gated behind `prefers-reduced-motion`, and the OS setting is
watched at runtime so flipping it mid-visit rebuilds the page in the other mode.
Reveals degrade to visible content if JavaScript never runs, so nothing is
trapped behind a script.

The lifecycle pan is a GSAP pin plus scrub above `lg`. Below that, and under
reduced motion, the same track is a plain horizontal scroller.

## The record

There is no photography on this site. The one visual is a canvas that draws the
product's own data model as sediment, because a varve is a layered annual
record and so is a varve store:

| band | meaning |
|---|---|
| solid ochre | a binding decision |
| hairline | a proposal, inert until a human accepts it |
| broken band | still binding, currently violated by the codebase |
| ghosted band | reverted or superseded, kept as record |
| thin neutral line | an ungoverned note |

The hero legend states exactly this, so the visual language and the product
model are learned in the same glance. Scrolling deposits layers, the pointer
parts them, and each section tells the canvas which tone to emphasise through
`data-strata`. Sections that need the width push the column aside with
`data-strata-region`; below `lg` it collapses to a seam at the edge.

`public/og.png` is rendered from the same engine at 1200x630.

## Deployment

Static build, no adapter. Any static host works; the current setup implies a
Vercel Git integration on `main` with `@vercel/analytics` reporting from the
layout. Release links refresh on each build, so a redeploy after a release is
enough to update them.
