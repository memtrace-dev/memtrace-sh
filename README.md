# memtrace.sh

Marketing site for [memtrace](https://github.com/memtrace-dev/memtrace) — persistent, searchable memory for AI coding agents.

**Live:** [memtrace.sh](https://memtrace.sh)

## Stack

- [Astro 6](https://astro.build) — static site generator
- [Tailwind CSS v4](https://tailwindcss.com) — styling via `@tailwindcss/vite`
- Vanilla JS — theme toggle, copy buttons, typewriter animation
- GitHub Releases API — latest release version fetched at build time

## Development

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # output to ./dist
npm run preview   # preview the build locally
```

Requires Node ≥ 22.12.0.

## Structure

```
src/
├── components/
│   ├── Nav.astro            # Navigation + theme toggle
│   ├── HeroTerminal.astro   # Install command with copy button
│   ├── TerminalWindow.astro # Reusable terminal shell
│   └── CodeBlock.astro      # Code snippet with copy button
├── layouts/
│   └── Layout.astro         # Base layout, SEO meta, JSON-LD
├── pages/
│   └── index.astro          # Landing page
└── styles/
    └── global.css           # Tailwind + design tokens (light/dark)
```

## Dynamic release links

Download links in the install section are fetched from the GitHub Releases API at build time — no manual updates needed when a new version ships, just redeploy.

## Deployment

Any static host works (Netlify, Vercel, Cloudflare Pages). Build output is in `./dist`.

Set up automatic deploys from `main` so release links stay current whenever a new GitHub release triggers a redeploy.
