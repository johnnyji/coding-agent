# Railway Deployment Guide

This guide is written for Railway AI (or a human operator) to deploy this application end-to-end. Follow it top-to-bottom — every step is required.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Railway Project                                 │
│                                                                              │
│   ┌────────────────┐   REST/SSE    ┌────────────────────────────────────┐   │
│   │   web service  │◄────────────►│           api service               │   │
│   │  (Next.js 14)  │              │     (Hono + LangGraph agent)        │   │
│   │   Port: 3000   │              │          Port: 8080                 │   │
│   └───────┬────────┘              └────┬──────────────┬────────────────┘   │
│           │                           │              │                      │
│           │ SQL (Auth.js adapter)     │ SQL          │ SQL                  │
│           ▼                           ▼              │                      │
│   ┌───────────────────────────────────────┐         │                      │
│   │        postgres service               │◄────────┘                      │
│   │    (Railway managed, Postgres 15)      │                                │
│   └───────────────────────────────────────┘                                 │
│                                                                              │
│   ┌───────────────────────────┐   ┌───────────────────────────────────┐    │
│   │      redis service        │◄──│           api service             │    │
│   │  (Railway managed Redis)  │   │                                   │    │
│   └───────────────────────────┘   └───────────────────────────────────┘    │
│                                                                              │
│   ┌─────────────────────────────┐   ┌──────────────────────────────────┐   │
│   │  Volume: sandboxes          │   │  Volume: mirrors                  │   │
│   │  Mount: /app/sandboxes      │◄──│  Mount: /app/mirrors              │   │
│   │  (api service only)         │   │  (api service only)               │   │
│   └─────────────────────────────┘   └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

External connections (from api service):
  api ──► Anthropic API     (Claude LLM calls for the coding agent)
  api ──► GitHub App API    (open PRs, read repos, post comments)
  api ──► Sandbox git ops   (clone repos into /app/mirrors, create worktrees in /app/sandboxes)

External connections (from web service):
  browser ──► web           (serves the Next.js UI)
  browser ──► api           (NEXT_PUBLIC_API_URL; REST + SSE streaming)
  browser ──► GitHub OAuth  (login via NextAuth GitHub provider)
```

**Data flow summary:**
1. User opens the web app → authenticates via GitHub OAuth → NextAuth stores session in Postgres.
2. User submits a coding task → browser POSTs to `api` (`NEXT_PUBLIC_API_URL/api/threads`).
3. `api` starts a LangGraph agent that clones the target repo into `/app/mirrors`, creates a git worktree in `/app/sandboxes`, calls Claude, and opens a GitHub PR.
4. Browser streams real-time progress via SSE (`GET /api/threads/:threadId/stream`).

---

## Services to Create

| Service name | Type | Dockerfile | Port | Healthcheck |
|---|---|---|---|---|
| `api` | GitHub repo | `apps/api/Dockerfile` | 8080 | `GET /health` |
| `web` | GitHub repo | `apps/web/Dockerfile` | 3000 | `GET /` |
| `postgres` | Railway managed | — (Postgres 15) | internal | — |
| `redis` | Railway managed | — (Redis) | internal | — |

---

## Step-by-Step Setup

### 1. Prerequisites — create external credentials first

Before touching Railway, gather these credentials:

**a. Generate a `NEXTAUTH_SECRET`** — a random 32-byte hex string. Run locally:
```bash
openssl rand -hex 32
```
Save this value; you will set it on **both** `api` and `web`.

**b. Create a GitHub OAuth App** (for user login):
- Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
- Application name: anything (e.g. `coding-agent`)
- Homepage URL: `https://<your-web-service>.up.railway.app` (fill in after Railway deploy)
- Authorization callback URL: `https://<your-web-service>.up.railway.app/api/auth/callback/github`
- Save the **Client ID** and **Client Secret**.

**c. Create a GitHub App** (for the bot to open PRs):
- Go to GitHub → Settings → Developer settings → GitHub Apps → New GitHub App
- GitHub App name: anything (e.g. `coding-agent-bot`)
- Homepage URL: same as above
- Webhook: disable (uncheck "Active") unless you need webhook events
- Repository permissions: `Contents` (Read & Write), `Pull requests` (Read & Write)
- Generate a **Private Key** (download the `.pem` file)
- Note the **App ID** shown on the app settings page
- Install the app on the target repositories

---

### 2. Create the Railway project

1. Log in to Railway and click **New Project**.
2. Choose **Empty Project**.

---

### 3. Add managed services

Inside the project:

**Add Postgres:**
- Click **+ New** → **Database** → **Add PostgreSQL**
- Railway will provision a Postgres 15 instance and expose `${{Postgres.DATABASE_URL}}`.

**Add Redis:**
- Click **+ New** → **Database** → **Add Redis**
- Railway will expose `${{Redis.REDIS_URL}}`.

---

### 4. Create the `api` service

1. Click **+ New** → **GitHub Repo** → select this repository.
2. Rename the service to `api`.
3. Under **Settings → Build**:
   - Builder: `Dockerfile`
   - Dockerfile path: `apps/api/Dockerfile`
   - Build context: `/` (repo root — required so Docker can reach `packages/shared/`)
4. Under **Settings → Deploy**:
   - Healthcheck path: `/health`
   - Healthcheck timeout: `300`
   - Restart policy: `On failure`, max retries: `3`
5. Under **Settings → Volumes**, attach two volumes:
   - Volume name `sandboxes` → mount path `/app/sandboxes`
   - Volume name `mirrors` → mount path `/app/mirrors`

---

### 5. Create the `web` service

1. Click **+ New** → **GitHub Repo** → select the same repository.
2. Rename the service to `web`.
3. Under **Settings → Build**:
   - Builder: `Dockerfile`
   - Dockerfile path: `apps/web/Dockerfile`
   - Build context: `/` (repo root)
4. Under **Settings → Deploy**:
   - Healthcheck path: `/`
   - Restart policy: `On failure`, max retries: `3`

---

### 6. Set environment variables

#### `api` service

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `GITHUB_APP_ID` | GitHub App ID (number from step 1c) |
| `GITHUB_APP_PRIVATE_KEY` | Contents of the `.pem` file (paste the raw PEM text including `-----BEGIN...` headers) |
| `NEXTAUTH_SECRET` | The value generated in step 1a |
| `ALLOWED_ORIGIN` | `https://<web-service-url>.up.railway.app` (set after web service is deployed) |
| `SANDBOX_BASE_PATH` | `/app/sandboxes` |
| `SANDBOX_MIRROR_PATH` | `/app/mirrors` |
| `SANDBOX_PORT_RANGE_START` | `5100` |
| `SANDBOX_PORT_RANGE_END` | `5199` |
| `DISTRU_SECRET_KEY_BASE` | Secret key for the sandboxed app's Rails/Phoenix env |
| `DISTRU_AWS_ACCESS_KEY_ID` | AWS access key injected into sandbox env |
| `DISTRU_AWS_SECRET_ACCESS_KEY` | AWS secret key injected into sandbox env |
| `DISTRU_AWS_REGION` | AWS region injected into sandbox env |
| `DISTRU_S3_BUCKET` | S3 bucket name injected into sandbox env |
| `DISTRU_STRIPE_SECRET_KEY` | Stripe secret key injected into sandbox env |
| `DISTRU_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key injected into sandbox env |
| `DISTRU_SENDGRID_API_KEY` | SendGrid API key injected into sandbox env |
| `DISTRU_ANTHROPIC_API_KEY` | Anthropic key for Claude Code running inside the sandbox |
| `DISTRU_OPENAI_API_KEY` | OpenAI key injected into sandbox env |
| `DISTRU_COHERE_API_KEY` | Cohere key injected into sandbox env |
| `DISTRU_GOOGLE_GEMINI_API_KEY` | Google Gemini key injected into sandbox env |
| `DISTRU_CHARGEBEE_API_KEY` | Chargebee key injected into sandbox env |
| `DISTRU_GOOGLE_MAPS_API_KEY` | Google Maps key injected into sandbox env |

> **Note:** All `DISTRU_*` variables are forwarded verbatim into the git-worktree sandbox environment so the AI agent has credentials to run the target application. Only set the ones your target app actually needs.

#### `web` service

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID from step 1b |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret from step 1b |
| `NEXTAUTH_SECRET` | **Same value** as the `api` service (step 1a) |
| `NEXTAUTH_URL` | `https://<web-service-url>.up.railway.app` |
| `NEXT_PUBLIC_API_URL` | `https://<api-service-url>.up.railway.app` |

---

### 7. Deploy

1. Trigger a deploy on the `api` service first. On startup it automatically runs `runMigrations()`, which creates the `orchestrator_sessions` table and the NextAuth tables in Postgres. No manual migration command is needed.
2. Once `api` is healthy (green health check), deploy the `web` service.
3. After both services are up, copy their public URLs and fill in:
   - `ALLOWED_ORIGIN` on `api` → the `web` service URL
   - `NEXTAUTH_URL` on `web` → the `web` service URL
   - `NEXT_PUBLIC_API_URL` on `web` → the `api` service URL
4. Update the GitHub OAuth App's **Authorization callback URL** to `{NEXTAUTH_URL}/api/auth/callback/github`.
5. Redeploy both services to pick up the updated env vars.

---

### 8. Verify

| Check | How |
|---|---|
| API healthy | `curl https://<api-url>/health` → `{"status":"ok"}` |
| Web loads | Open `https://<web-url>` in a browser — GitHub login button should appear |
| Auth works | Click "Sign in with GitHub" — should redirect and log you in |
| Agent runs | Submit a coding task through the UI and watch the SSE stream |

---

## Volumes Reference

Both volumes are attached to the `api` service only. The web service has no persistent storage.

| Volume name | Mount path | Purpose |
|---|---|---|
| `sandboxes` | `/app/sandboxes` | Git worktrees created for each active agent session |
| `mirrors` | `/app/mirrors` | Bare mirror clones of target repos (for fast worktree creation) |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `api` fails health check on first boot | Migration taking >300 s | Increase healthcheck timeout in Railway settings |
| `web` shows "Configuration error" | `NEXTAUTH_SECRET` mismatch or `NEXTAUTH_URL` wrong | Verify both env vars on the `web` service |
| GitHub login loops / 401 | OAuth callback URL doesn't match `NEXTAUTH_URL` | Update the callback URL in the GitHub OAuth App settings |
| Agent fails to clone repo | `GITHUB_APP_PRIVATE_KEY` malformed | Paste the full PEM including header/footer lines; no base64 encoding needed |
| CORS errors in browser | `ALLOWED_ORIGIN` on `api` doesn't match the web URL | Set `ALLOWED_ORIGIN` to the exact origin (e.g. `https://web.up.railway.app`) |
