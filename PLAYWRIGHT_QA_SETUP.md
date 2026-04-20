# Playwright QA Runbook

This document captures everything a QA agent needs to set up and run Playwright QA for the coding-agent app without repeating past mistakes.

---

## Prerequisites

All services must be running and properly configured before opening Playwright. Do these steps in order.

### 1. Environment File

All env vars live in a **single `.env` at the repo root**. Do not create nested `.env` files inside `apps/api/` or `apps/web/` — the dev scripts load the root file directly.

Required vars (all in root `.env`):

```env
# GitHub App (bot identity for PRs)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----
"
GITHUB_APP_SLUG=coding-agent-dev

# GitHub OAuth (user sign-in)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Database (orchestrator)
DATABASE_URL=postgresql://johnnyji@localhost/johnnyji

# NextAuth / Auth.js
NEXTAUTH_SECRET=
AUTH_SECRET=          # same value as NEXTAUTH_SECRET
NEXTAUTH_URL=https://coding-agent-dev.distru.com

# API service
ALLOWED_ORIGIN=https://coding-agent-dev.distru.com
NEXT_PUBLIC_API_URL=http://localhost:8080

# Claude
ANTHROPIC_API_KEY=

# Sandbox
SANDBOX_BASE_PATH=/app/sandboxes
SANDBOX_MIRROR_PATH=/app/mirrors
SANDBOX_PORT_RANGE_START=5100
SANDBOX_PORT_RANGE_END=5199
```

> **GITHUB_APP_PRIVATE_KEY**: Must be the full PEM content (starting with `-----BEGIN RSA PRIVATE KEY-----`), not the fingerprint shown in GitHub App settings (e.g. `SHA256:...`). Download the `.pem` file from the GitHub App settings page.

> **Why a single file**: Both `apps/api/package.json` (`--env-file ../../.env`) and `apps/web/package.json` (`node --env-file=../../.env`) load the root file explicitly. Next.js will not find a `.env.local` in `apps/web/` (it doesn't exist), so all vars come from the root file.

### 2. Start Services

Start each service in this order:

```bash
# 1. API on port 8080
pnpm --filter api dev

# 2. Web app on port 3001 (cloudflared config targets 3001, -p 3001 is built into the dev script)
pnpm --filter web dev

# 3. Cloudflare tunnel (use the project config, not a quick tunnel)
cloudflared tunnel --config .cloudflared/config.yml run
```

> **Why the named tunnel**: The GitHub OAuth App's callback URL is set to `https://coding-agent-dev.distru.com/api/auth/callback/github`. OAuth will not work on `localhost` because GitHub's redirect never reaches the local machine through Cloudflare.

### 3. Verify All Services

```bash
curl http://localhost:8080/health          # → {"status":"ok"}
curl -o /dev/null -w "%{http_code}" http://localhost:3001   # → 200
curl -o /dev/null -w "%{http_code}" https://coding-agent-dev.distru.com  # → 200
```

> **DNS note**: The local DNS resolver (26.26.26.x) doesn't resolve `coding-agent-dev.distru.com`. Always verify using `dig @8.8.8.8` or `dig @1.1.1.1`. curl inside the test machine works because the browser resolves via the system's external DNS fallback.

---

## Running QA

### Always navigate via the tunnel URL

```
https://coding-agent-dev.distru.com
```

Never use `localhost:3001` for QA — GitHub OAuth callbacks and the GitHub App installation check both require the public tunnel URL.

### Auth Flow

1. Navigate to `https://coding-agent-dev.distru.com` → expect "Sign in with GitHub" button centered on page.
2. Click "Sign in with GitHub" → should redirect to `github.com/login/oauth/authorize`.
3. Click "Authorize" → should redirect back to the tunnel URL and render the authenticated app.

> If the page shows "Error: Failed to load repositories" instead of the sign-in button, `NEXTAUTH_SECRET` / `AUTH_SECRET` is missing or wrong in the root `.env`.

### Starting a Session

- Type a feature request in the textarea and click Start.
- Status badge should transition: `idle` → `running`.
- The pre-session form should disappear and the conversation view should render.
- The message input should be disabled (status is `running`, not `waiting`).

> The GitHub App must be installed on `DistruApp` for `POST /api/threads` to succeed. Without it the API returns 422 and the status badge shows `error`.

### Known Playwright quirk with React controlled inputs

Playwright's `browser_type` (`fill`) does **not** reliably trigger React's `onChange` handler on controlled `<textarea>` / `<input>` elements. After `fill`, always press a key (e.g. `Space`) to force the synthetic event and update React state. Otherwise the Start button will stay disabled even though the field visually shows text.

### Signing out

`GET /api/auth/signout` returns 500 (Bug #17 — Auth.js v5 signout misconfiguration). Do not attempt to sign out during QA — the session persists across browser navigations. If you need a fresh unauthenticated state, clear cookies via DevTools → Application → Cookies → Delete All, then reload.

### Web dev server

If you need to restart the web dev server, use:

```bash
pnpm --filter web dev
```

The dev script now correctly points to `./node_modules/next/dist/bin/next` (the actual Node.js entry point). Do **not** change it back to `./node_modules/.bin/next` — that path is a shell script wrapper and fails when invoked with `node --env-file`.
