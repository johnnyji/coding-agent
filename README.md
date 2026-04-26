# Coding Agent

An AI-powered coding orchestrator that integrates with GitHub to autonomously implement features, fix bugs, and run QA via Claude. It uses a Next.js frontend, a Hono API backend, and LangGraph with PostgreSQL for stateful agent orchestration.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+ (`npm install -g pnpm`)
- [PostgreSQL](https://www.postgresql.org/) running locally (or a connection URL)
- An [Anthropic API key](https://console.anthropic.com/)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (for webhook tunneling)
- A GitHub App (see below)

## Setup

### 1. Install runtime dependencies

This project uses [asdf](https://asdf-vm.com/) to manage Node.js and pnpm versions. With asdf installed:

```bash
asdf plugin add nodejs
asdf plugin add pnpm
asdf install
```

This will install the exact versions specified in `.tool-versions`.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Then fill in the values in `.env`:

| Variable | Description |
|---|---|
| `GITHUB_APP_ID` | ID of your GitHub App (bot) |
| `GITHUB_APP_PRIVATE_KEY` | Private key for your GitHub App — paste the full PEM file contents directly as the value (multi-line string) |
| `GITHUB_APP_SLUG` | Slug of your GitHub App (the URL-safe name shown in the app settings) |
| `GITHUB_CLIENT_ID` | Client ID from your **GitHub OAuth App** (for web sign-in — see step 8 below) |
| `GITHUB_CLIENT_SECRET` | Client secret from your **GitHub OAuth App** (for web sign-in — see step 8 below) |
| `NEXTAUTH_SECRET` | Random secret for NextAuth session signing — run `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Base URL of the web app (e.g. `http://localhost:3001`) |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgres://user:pass@localhost:5432/coding_agent`) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `SANDBOX_BASE_PATH` | Local path for sandbox workspaces (default: `/app/sandboxes`) |
| `SANDBOX_MIRROR_PATH` | Local path for repo mirrors (default: `/app/mirrors`) |
| `SANDBOX_PORT_RANGE_START` | Start of port range for sandbox processes (default: `5100`) |
| `SANDBOX_PORT_RANGE_END` | End of port range for sandbox processes (default: `5199`) |

For `GITHUB_APP_PRIVATE_KEY`, paste the contents of the downloaded `.pem` file directly — you do not need to keep the file in the project:

```
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEow...
-----END RSA PRIVATE KEY-----"
```

The `DISTRU_*` variables are app-specific credentials injected into sandboxes at creation time. Set these if you are running sandboxes against the Distru app locally.

### 4. Run database migrations

```bash
pnpm --filter api db:migrate
```

### 5. Build shared packages

The `shared` package must be built before the apps can import from it:

```bash
pnpm --filter @coding-agent/shared build
```

### 6. Set up Cloudflare Tunnel

The dev server starts a `cloudflared` tunnel alongside the API and web servers so GitHub can deliver webhooks to your local machine. Each developer needs their own tunnel and hostname. You only need to do this once.

**Install cloudflared**
```bash
brew install cloudflared
```

**Authenticate with your Cloudflare account**
```bash
cloudflared tunnel login
```

> Skip this step if you already have a Cloudflare cert locally (`~/.cloudflared/cert.pem`)

**Create a named tunnel**
```bash
cloudflared tunnel create coding-agent-dev
```

Note the tunnel ID in the output — you'll need it in the next step.

**Create `~/.cloudflared/config.yml`**
```yaml
tunnel: coding-agent-dev
credentials-file: /Users/<your-name>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: <your-name>-coding-agent-dev.distru.com
    service: http://localhost:8080
  - service: http_status:404
```

Replace `<your-name>` and `<tunnel-id>` accordingly. The domain must be on Cloudflare DNS — the DNS record will be created automatically on first run.

Note your tunnel hostname (`<your-name>-coding-agent-dev.distru.com`) — you'll need it when configuring the GitHub App webhook URL.

**(Optional) Run as a persistent background service**
```bash
cloudflared service install
```

Once configured, `pnpm dev` will start the tunnel automatically.

### 7. Start the development servers

```bash
pnpm dev
```

This starts all apps in parallel:
- **API** (Hono) — `http://localhost:8080` (tsx watch, auto-reloads on changes)
- **Web** (Next.js) — `http://localhost:3001`
- **Cloudflare Tunnel** — proxies `<your-name>-coding-agent-dev.distru.com` → `localhost:8080`

## Project Structure

```
apps/
  api/        # Hono backend — GitHub webhooks, agent orchestration, REST API
  web/        # Next.js frontend
packages/
  shared/     # Shared TypeScript types (OrchestratorState, DelegationDecision)
tech_specs/   # Technical design documents for agent features
```

## Useful Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start all apps in dev mode |
| `pnpm build` | Build all packages (shared → api → web) |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all packages |
| `pnpm check-types` | TypeScript type check all packages |
| `pnpm --filter api db:migrate` | Run database migrations |

## GitHub Setup

Two separate GitHub credentials are required — one for the bot that opens PRs, one for web sign-in.

### GitHub App (bot — used by the API service)

1. Go to **GitHub → Settings → Developer Settings → GitHub Apps → New GitHub App**
2. Set the webhook URL to `https://<your-name>-coding-agent-dev.distru.com/webhook`
3. Grant repository permissions: `Contents` (Read & Write), `Pull requests` (Read & Write), `Issues` (Read & Write)
4. Subscribe to events: `push`, `pull_request`, `issues`
5. Generate a private key and download the `.pem` file
6. Copy the **App ID**, **App slug**, and **private key contents** into `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, and `GITHUB_APP_PRIVATE_KEY` in your `.env`

### GitHub OAuth App (for web sign-in)

1. Go to **GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App**
2. Set the Authorization callback URL to `http://localhost:3001/api/auth/callback/github`
3. Copy the **Client ID** and **Client Secret** into `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in your `.env`
