# QA Log — Completed Bugs

All bugs that have been fixed and confirmed. See `qa_log.md` for open bugs and session history.

---

## Fixed in 2026-04-18

- [x] **Bug 1** — Migration camelCase/snake_case mismatch `FIXED`
  - **Found:** API startup crash — `CREATE INDEX IF NOT EXISTS` validated the column even when the index name already existed.
  - **Fixed:** Reverted `001_sessions.sql` to snake_case matching the DB and all SQL in `app.ts`.

- [x] **Bug 2** — NEXTAUTH_SECRET missing causes broken unauth state `FIXED`
  - **Found:** Without `NEXTAUTH_SECRET`, Auth.js returns a truthy error object from `auth()`. `page.tsx` renders the authenticated layout for unauth users who see "Error: Failed to load repositories" instead of the sign-in button.
  - **Fixed:** Created `apps/web/.env.local` with `NEXTAUTH_SECRET`, `AUTH_SECRET`, and `NEXTAUTH_URL`.

- [x] **Bug 3** — API dev script doesn't load env vars `FIXED`
  - **Found:** `tsx watch src/index.ts` doesn't auto-load `.env`. API runs without `NEXTAUTH_SECRET` or GitHub credentials, causing all API calls to fail.
  - **Fixed:** Changed `apps/api/package.json` dev script to `tsx watch --env-file .env src/index.ts`. Created `apps/api/.env`.

- [x] **Bug 4** — UI stuck on pre-session form after failed Start `FIXED`
  - **Found:** After clicking Start, status badge changes to "running" but the pre-session form (textarea + Start button) never disappears — even if the API call fails. `ChatInterface` gates the conversation view on `threadId !== null`. `useOrchestrator.startSession` sets `status = 'running'` immediately (before the API call), then sets `status = 'error'` if the API fails — but `threadId` stays `null` throughout. No error message is shown to the user.
  - **Fixed:** `useOrchestrator.startSession` now only sets `status = 'running'` after a valid session token is obtained. On API failure it sets `status = 'error'` and populates a new `startError` string (extracted from the API error body). `ChatInterface` displays `startError` as an inline red message below the textarea and disables the Start button (showing "Starting…") while the API call is in flight.

---

## Fixed in 2026-04-20

- [x] **Bug 6** — GitHub App credentials missing from API env `FIXED`
  - **Found:** `apps/api/.env` is missing `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_SLUG`. The preflight check in `POST /api/threads` always returns 422, blocking all session creation.
  - **Fixed:** Resolved as part of Bug #8 fix — all env vars consolidated into root `.env` which already contained the correct values. Nested `apps/api/.env` deleted.

- [x] **Bug 7** — Cloudflare tunnel port mismatch `FIXED`
  - **Found:** `.cloudflared/config.yml` routes to `http://localhost:3001` but `pnpm --filter web dev` starts on port 3000 by default. Tunnel serves 502.
  - **Fixed:** `apps/web/package.json` dev script already includes `-p 3001`. Tunnel routes to the correct port.

- [x] **Bug 8** — `GITHUB_APP_PRIVATE_KEY` is a fingerprint, not a PEM key `FIXED`
  - **Found:** After adding GitHub App credentials to `apps/api/.env`, `POST /api/threads` still returned 422. Direct test with `@octokit/auth-app` throws "Invalid keyData". The value `SHA256:5qHIH0k2+M1/p6/3y83H0h6nuZ7JKNtS0m34nJIsIiM=` is the key fingerprint shown in GitHub App settings, not the downloadable `.pem` file.
  - **Fixed:** Root `.env` already contained the correct PEM key. Consolidated all env vars into root `.env`; deleted `apps/api/.env` and `apps/web/.env.local`; updated both dev scripts to `--env-file ../../.env` / `node --env-file=../../.env`. Confirmed fix: API now successfully calls GitHub API — `GET /repos/.../installation - 404` in logs instead of `Invalid keyData` error.

- [x] **Bug 9** — `userId` type mismatch in session-token JWT `FIXED`
  - **Found:** `POST /api/threads` always returned 401 "Invalid token payload". `session-token/route.ts` puts `session.user.id` (a Postgres `SERIAL` integer) directly into the JWT payload. `validateSession.ts` checks `typeof payload.userId !== 'string'` — the integer fails this check.
  - **Fixed:** Changed `apps/web/src/app/api/session-token/route.ts` to `userId: String(session.user.id)`.

- [x] **Bug 11** — `DistruApp/distru` never appears in the repo selector `FIXED`
  - **Found:** The OAuth App only requests `read:user user:email` scopes. `repos.listForAuthenticatedUser` with these scopes does not return private org repos like `DistruApp/distru`. Same root cause as Bug #5.
  - **Fixed:** Same fix as Bug #5 — `RepoSelector` removed, repo hardcoded in `HomeContent.tsx`.

- [x] **Bug 12** — `handleStart` unhandled promise rejection creates dev error overlay `FIXED`
  - **Found:** Clicking Start when API returns 422: `ChatInterface.tsx` `handleStart` calls `await startSession(...)` with no try/catch. `useOrchestrator` sets `status = 'error'` and re-throws. Since the click handler uses `void handleStart()`, the rejection is unhandled — React dev mode surfaces it as a Next.js error overlay.
  - **Fixed:** `startSession` no longer throws — it handles all error paths internally by setting `status = 'error'` and `startError`. `handleStart` in `ChatInterface` is now a plain (non-async) function that calls `void startSession(...)`.

- [x] **Bug 5** — Repo selector shows all repos instead of only `DistruApp/distru` `FIXED`
  - **Found:** Dropdown lists all GitHub repos accessible to the user (~75+ repos). The orchestrator is built exclusively for `DistruApp/distru` and won't work correctly on arbitrary repos.
  - **Fixed:** Removed `RepoSelector` component from `HomeContent.tsx`. Hardcoded `repoOwner = 'DistruApp'`, `repoName = 'distru'` directly in `HomeContent.tsx`.

- [x] **Bug 13** — SSE stream blocked by Chrome Private Network Access (PNA) restriction `FIXED`
  - **Found:** After successful session creation, the browser (at `https://coding-agent-dev.distru.com`) attempts to open an `EventSource` to `http://localhost:8080/api/threads/{threadId}/stream`. Chrome blocks this with: "Permission was denied for this request to access the `loopback` address space."
  - **Fixed:** Created `apps/web/src/app/api/proxy/[...path]/route.ts` — a Next.js server-side catch-all route that forwards all requests (including SSE streaming) from `/api/proxy/{path}` to `${NEXT_PUBLIC_API_URL}/api/{path}`. Updated `useOrchestrator.ts` to use `/api/proxy/threads/...` instead of calling the API directly from the browser.

- [x] **Bug 14** — Unhandled `SandboxManager.create()` rejection crashes the API process `FIXED`
  - **Found:** After `POST /api/threads` succeeded and the graph started, `techSpecNode` called `SandboxManager.create()`, which attempted `mkdir '/app'` and threw `ENOENT: no such file or directory`. The unhandled rejection crashed the HTTP server. Session status in the DB remained `'running'` permanently.
  - **Fixed:** (1) `runGraphStream` in `run.ts` catches stream errors, emits error events, and updates DB to `status = 'error'`. (2) Added `process.on('unhandledRejection', ...)` in `src/index.ts` as a safety net.

---

## Fixed in 2026-04-20 — Session 5

- [x] **Bug 16** — `apps/web/package.json` dev script broken `FIXED`
  - **Found:** `node --env-file=../../.env ./node_modules/.bin/next dev -p 3001` fails because `.bin/next` is a shell script, not a Node.js module. `node` throws `SyntaxError: missing ) after argument list`.
  - **Fixed:** Changed dev script to `node --env-file=../../.env ./node_modules/next/dist/bin/next dev -p 3001`, which points to the actual Node.js entry point.

---

## Fixed in 2026-04-26 — Session 6

- [x] **Bug 15** — SSE `error` events don't surface error content to the user `FIXED`
  - **Found:** When the graph fails, `runGraphStream` emits `{ type: 'error', content: '...' }` on the SSE stream. `useOrchestrator.ts` only called `setStatus('error')` — the `content` field was discarded. The user saw the "error" badge but no explanation.
  - **Fixed:** `useOrchestrator.ts` error handler now appends `data.content` to `messages` as `{ role: 'system', content }`. `ChatInterface.tsx` renders system messages as a distinct red block (`bg-red-50 text-red-700`). Confirmed: error text appeared in the conversation view during QA session 6.

- [x] **Bug 17** — `GET /api/auth/signout` returns 500 `FIXED`
  - **Found:** Navigating to `/api/auth/signout` (GET or POST) returns 500. Auth.js v5 with App Router does not support direct GET/POST signout — it requires a server action. Consequence: users cannot sign out.
  - **Fixed:** Added `signOut` import to `apps/web/src/app/page.tsx`. Added a "Sign out" button in the authenticated header that calls `signOut()` via a server action form. Confirmed: clicking "Sign out" redirects to unauthenticated state with no errors.

- [x] **Bug 18** — `graph.stream()` not awaited — `streamIterable is not async iterable` `FIXED`
  - **Found:** SSE stream immediately received `TypeError: streamIterable is not async iterable`. In `@langchain/langgraph ^1.2.8`, `graph.stream()` returns a `Promise<IterableReadableStream>`, not an `AsyncIterable` directly. `run.ts` called it without `await` and cast the result `as unknown as AsyncIterable`, hiding the type mismatch. `for await (const update of streamIterable)` failed because a `Promise` is not async-iterable.
  - **Fixed:** Both `startThread` and `resumeThread` in `run.ts` now `await graph.stream()` inside a `void (async () => { ... })()` fire-and-forget wrapper.
