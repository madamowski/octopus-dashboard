# React Static App

A static frontend template: React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui. No backend.

`bun run build` produces a `dist/` directory of pre-built HTML/JS/CSS that the Workshop deploy CLI uploads to Cloudflare R2 and serves through the auth-proxy.

## Quick Start

```bash
bun install
bun run dev      # Vite dev server
```

## Project Structure

```
├── src/
│   ├── components/ui/    # shadcn/ui components
│   ├── lib/              # Utilities
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── index.html            # Vite entry
├── vite.config.ts
└── package.json
```

## Deploy

```bash
wksp deploy
```

The CLI runs `bun run build`, then uploads `dist/` to R2. The Workshop auth-proxy serves the bundle at your project's slug.

## When NOT to use this template

If your app needs:

- A database or server-side secrets — use `react-app-python` (full-stack).
- Server-rendered pages or API routes — use `react-app-python`.
- Long-running background jobs — use `react-app-python` or `data-app-streamlit`.

`import.meta.env.VITE_*` values are baked into the bundle and visible to anyone who loads the page. Never put secrets there.

## Design

Avoid AI-slop defaults: centered hero layouts with purple gradients, uniformly-rounded corners, and the Inter font. Prefer purposeful typography, asymmetric composition, and a brand-specific palette.
