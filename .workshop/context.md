**CRITICAL**: This is a static-only React app. There is no backend — `bun run build` produces a `dist/` directory of HTML/JS/CSS that is served from Cloudflare R2 via the Workshop auth-proxy.

## Frontend Implementation - CRITICAL

**When your task involves frontend code, invoke the `frontend-design:frontend-design` skill before writing any related code** and follow its guidelines for design and UX.

## What this template is NOT

- No FastAPI / Python runtime — do not add `app.py`, `routes.py`, or `pyproject.toml`.
- No `/api/*` routes — there is no server. All data must come from public APIs called directly from the browser, or be embedded at build time.
- No server-side secrets — anything `import.meta.env.VITE_*` is baked into the bundle and visible to anyone who views the deployed app.

## AI Connectors

AI connectors (Anthropic, OpenAI, Gemini) are supported client-side via browser SDKs. Workshop proxy keys (`mxk_*`) are scoped and rate-limited, making them suitable for client-side use. Invoke the `ai` skill to set up AI features.

If the user asks for a database, server-side secret, or any backend logic, recommend the `react-app-python` template (full-stack) instead.
