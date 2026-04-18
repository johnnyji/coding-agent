# Deployment Guide

This monorepo deploys two Railway services (`api` and `web`) backed by a managed Postgres instance and a Redis instance.

## Services

| Service | Dockerfile | Port | Healthcheck |
|---|---|---|---|
| `api` | `apps/api/Dockerfile` | 8080 | `GET /health` |
| `web` | `apps/web/Dockerfile` | 3000 | `GET /` |
| `postgres` | Railway managed (Postgres 15) | — | — |
| `redis` | Railway managed (Redis) | — | — |

## Volumes (attach to `api` service)

| Volume name | Mount path | Purpose |
|---|---|---|
| `sandboxes` | `/app/sandboxes` | Git worktrees for active sessions |
| `mirrors` | `/app/mirrors` | Bare mirror clones of target repos |

## Environment Variables

### `api` service

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (Railway auto-provides from the Postgres service) |
| `REDIS_URL` | Redis connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude API calls (delegation agent) |
| `GITHUB_APP_ID` | GitHub App ID (bot account for opening PRs) |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (PEM, base64-encoded or raw) |
| `NEXTAUTH_SECRET` | Secret used to verify JWTs issued by the web service |
| `ALLOWED_ORIGIN` | The web app's Railway URL (e.g. `https://web.up.railway.app`) — sets CORS allowed origin |
| `SANDBOX_BASE_PATH` | Filesystem path for worktrees (default: `/app/sandboxes`) |
| `SANDBOX_MIRROR_PATH` | Filesystem path for bare mirrors (default: `/app/mirrors`) |
| `SANDBOX_PORT_RANGE_START` | First port in the QA dev-server pool (default: `5100`) |
| `SANDBOX_PORT_RANGE_END` | Last port in the QA dev-server pool (default: `5199`) |
| `DISTRU_SECRET_KEY_BASE` | Injected into sandbox `config/env/dev.env` as `SECRET_KEY_BASE` |
| `DISTRU_AWS_ACCESS_KEY_ID` | Injected into sandbox env as `AWS_ACCESS_KEY_ID` |
| `DISTRU_AWS_SECRET_ACCESS_KEY` | Injected into sandbox env as `AWS_SECRET_ACCESS_KEY` |
| `DISTRU_AWS_REGION` | Injected into sandbox env as `AWS_REGION` |
| `DISTRU_S3_BUCKET` | Injected into sandbox env as `S3_BUCKET` |
| `DISTRU_STRIPE_SECRET_KEY` | Injected into sandbox env as `STRIPE_SECRET_KEY` |
| `DISTRU_STRIPE_PUBLISHABLE_KEY` | Injected into sandbox env as `STRIPE_PUBLISHABLE_KEY` |
| `DISTRU_SENDGRID_API_KEY` | Injected into sandbox env as `SENDGRID_API_KEY` |
| `DISTRU_ANTHROPIC_API_KEY` | Injected into sandbox env as `ANTHROPIC_API_KEY` (for Claude Code inside the sandbox) |
| `DISTRU_OPENAI_API_KEY` | Injected into sandbox env as `OPENAI_API_KEY` |
| `DISTRU_COHERE_API_KEY` | Injected into sandbox env as `COHERE_API_KEY` |
| `DISTRU_GOOGLE_GEMINI_API_KEY` | Injected into sandbox env as `GOOGLE_GEMINI_API_KEY` |
| `DISTRU_CHARGEBEE_API_KEY` | Injected into sandbox env as `CHARGEBEE_API_KEY` |
| `DISTRU_GOOGLE_MAPS_API_KEY` | Injected into sandbox env as `GOOGLE_MAPS_API_KEY` |

### `web` service

| Variable | Description |
|---|---|
| `DATABASE_URL` | Same Postgres connection string (used by Auth.js `@auth/pg-adapter`) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID (for NextAuth GitHub provider) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `NEXTAUTH_SECRET` | Secret for signing Auth.js JWTs and session tokens — must match the `api` service |
| `NEXTAUTH_URL` | The web app's canonical URL (e.g. `https://web.up.railway.app`) |
| `NEXT_PUBLIC_API_URL` | The `api` service's Railway URL (e.g. `https://api.up.railway.app`) — used by the browser to call the API |

## First-time Setup

1. Create a Railway project and add the Postgres and Redis plugins.
2. Create two Railway services in the project, both pointing at this repo:
   - **api**: set `Dockerfile path` → `apps/api/Dockerfile`, attach the `sandboxes` and `mirrors` volumes.
   - **web**: set `Dockerfile path` → `apps/web/Dockerfile`.
3. Set all environment variables listed above on the respective services.
4. On first deploy, the `api` service runs `runMigrations()` automatically before the Hono server starts. No manual migration step is needed.
5. Point your GitHub OAuth App's callback URL to `{NEXTAUTH_URL}/api/auth/callback/github`.
6. Install the GitHub App on the target repositories and note the App ID and private key.
