# QA Log for Coding Orchestrator

**Important**: Before starting any QA session or interacting with this file, read `qa_log_instructions.md` to understand how to properly QA.

Fixed bugs live in `qa_log_completed.md`. Only open/unverified bugs appear below.

---

## Open Bugs

- [ ] **Bug 10** — GitHub OAuth user token expires every 8 hours, no refresh logic `PARTIALLY FIXED`
  - **Found:** 2026-04-20 Session 1. Expired `ghu_` token stored in `accounts` table caused `/api/repos` to return 500. Re-triggered in Session 6: `GET /api/session-token` returned 500 because `octokit.users.getAuthenticated()` threw on the expired token.
  - **Partial fix (Session 6):** `session-token/route.ts` now wraps the Octokit call in try/catch; on failure, falls back to `session.user.name` for `userLogin`. This prevents a 500 crash — the JWT is still issued using the stored display name.
  - **Remaining work:** Root cause unresolved. Implement token refresh in `apps/web/src/auth.ts`: in the `session` callback, check `expires_at`; if expired or near expiry, call `POST https://github.com/login/oauth/access_token` with `grant_type=refresh_token` and update the `accounts` table.

- [ ] **Bug 19** — Cloudflare 524 timeout kills long-running SSE streams `FIX APPLIED, NEEDS VERIFICATION`
  - **Found:** 2026-04-26 Session 6. After graph started running (~60s), the SSE stream returned HTTP 524. Cloudflare drops connections that are idle for ~100s. The client was permanently setting `status = 'error'` on the 524 even though the graph was still running server-side.
  - **Fix applied (Session 6):** (1) `app.ts` SSE handler now sends `': ping\n\n'` every 30s via `setInterval` to reset Cloudflare's idle timeout. (2) `useOrchestrator.ts` `openStream` now reconnects on transient errors (any non-401/403/404 response) instead of permanently setting `status = 'error'`.
  - **Remaining work:** Full verification requires a session that runs >100s end-to-end without a 524. Can only be confirmed via Railway deployment where SandboxManager works.

---

## 2026-04-18

QA run via Playwright against `https://coding-agent-dev.distru.com` (Cloudflare tunnel → localhost:3001).

### Steps Taken

- [x] Unauthenticated landing page shows "Sign in with GitHub" button centered on page
- [x] Clicking "Sign in with GitHub" redirects to GitHub OAuth authorization screen with correct app name ("coding-agent-dev by Johnny Ji")
- [x] Authorizing the app redirects back to the app and establishes an authenticated session
- [x] Authenticated view renders: header bar with "Coding Agent" title, repo selector dropdown
- [x] `/api/repos` populates the dropdown with accessible GitHub repos
- [x] Selecting a repo reveals the ChatInterface with status badge ("idle"), feature request textarea, and disabled Start button
- [x] Typing in the textarea enables the Start button
- [x] Clicking Start transitions status badge from "idle" to "running"
- [x] `GET /health` returns `{"status":"ok"}`
- [x] JWT validation in API middleware works correctly
- [x] DB insert for new sessions succeeds
- [x] CORS configured correctly (no browser errors on cross-origin requests)
- [ ] Conversation view renders after Start — blocked by Bug #4 (form persists on API error)
- [ ] SSE stream delivers messages to the chat UI — blocked by Bug #6 (GitHub App credentials missing)
- [ ] Status transitions: running → waiting → running → finished (requires full E2E run)
- [ ] PR link banner appears when session finishes (requires full E2E run)
- [ ] Message input enabled when status is "waiting" (requires full E2E run)
- [ ] Session survives browser close and reconnect (requires full E2E run)

Bugs found this session: #1, #2, #3, #4, #5, #6, #7 → see `qa_log_completed.md`

---

## 2026-04-20

QA run via Playwright MCP against `https://coding-agent-dev.distru.com` (Cloudflare tunnel → localhost:3001). New DistruApp GitHub OAuth App (`Iv1.85f528fb7c0e920e`) and GitHub App (ID `96559`) credentials were applied mid-session.

### Steps Taken

- [x] Unauthenticated landing page shows "Sign in with GitHub" button centered on page
- [x] Clicking "Sign in with GitHub" redirects to GitHub OAuth authorization screen — URL is `github.com/login/oauth/authorize` with correct `client_id=Iv1.85f528fb7c0e920e`; page title shows "DistruApp by Distru"
- [x] Authorizing the app redirects back to `https://coding-agent-dev.distru.com` and establishes an authenticated session
- [x] Authenticated view renders: "Coding Agent" header + repo selector dropdown
- [x] `/api/repos` populates the dropdown with accessible GitHub repos (75+ repos)
- [x] Selecting a repo reveals the ChatInterface with "idle" status badge, feature request textarea, and disabled Start button
- [x] Typing in the textarea enables the Start button
- [x] Clicking Start transitions the status badge from "idle" to "running"
- [x] `GET /health` returns `{"status":"ok"}`
- [x] JWT validation in API middleware — initially failing (see Bug #9), fixed during session
- [x] CORS configured correctly — no browser errors on cross-origin requests to `localhost:8080`
- [ ] DB insert for new sessions — blocked by Bug #8 (invalid GitHub App private key)
- [ ] Conversation view renders after Start — blocked by Bug #8
- [ ] SSE stream delivers messages to the chat UI — blocked by Bug #8
- [ ] Status transitions, PR link, message input — blocked by Bug #8
- [ ] Session survives browser close and reconnect — blocked by Bug #8

Bugs found this session: #8, #9, #10, #11 → see `qa_log_completed.md` for #8, #9, #11. Bug #10 still open above.

---

## 2026-04-20 — Session 2

QA run via Playwright MCP. Auth session from Session 1 still valid. Focus: re-QA open bugs and verify env/startup setup.

**Key finding:** Root `.env` already had the correct PEM private key all along. Consolidated to a single root `.env` — nested `apps/api/.env` and `apps/web/.env.local` deleted; dev scripts updated to use `--env-file ../../.env`.

### Steps Taken

- [x] Services verified: `GET /health` → `{"status":"ok"}`, web `localhost:3001` → 200, Cloudflare tunnel → 200
- [x] Bug #7 re-QA: `.cloudflared/config.yml` routes to `localhost:3001`; `apps/web` dev script already has `-p 3001` — **FIXED**
- [x] Authenticated view renders: "Coding Agent" heading + repo selector dropdown
- [x] `/api/repos` populates dropdown with 75+ repos — `DistruApp/distru` absent — Bug #5/#11 still OPEN
- [x] Selecting `johnnyji/coding-agent` reveals ChatInterface with "idle" badge, textarea, disabled Start button
- [x] Typing in textarea enables the Start button
- [x] Clicking Start: status badge transitions "idle" → "error"; pre-session form persists (threadId stays null — correct UI behavior)
- [x] `POST /api/threads` returned 422 — traced to `apps/api/.env` having fingerprint instead of PEM. Fixed by consolidating to root `.env`.
- [x] No inline error message shown to user when Start fails — Bug #4 still OPEN; Next.js dev overlay from unhandled rejection (Bug #12)
- [ ] Conversation view, SSE stream, status transitions, PR link — blocked by Bug #8 (env fix pending restart)
- [ ] Session survives browser close and reconnect — blocked by Bug #8

Bugs found this session: #7 (confirmed fixed), #8 (fixed), #12 → see `qa_log_completed.md`

---

## 2026-04-20 — Session 3

QA run via Playwright MCP after env consolidation. Services restarted with root `.env`. Auth session still valid.

### Steps Taken

- [x] API restarted with `source ../../.env && tsx src/index.ts` — `GET /health` → `{"status":"ok"}`
- [x] Authenticated view renders: "Coding Agent" heading + repo selector with 75+ repos
- [x] `/api/repos` populates correctly — `DistruApp/distru` still absent (Bug #5/#11 still OPEN)
- [x] Selecting `johnnyji/coding-agent` reveals ChatInterface: "idle" badge, textarea, disabled Start button
- [x] Typing in textarea enables Start button
- [x] Clicking Start: `POST /api/threads` returns 422 — different reason than before
- [x] Bug #8 verified FIXED: API log shows `GET /repos/johnnyji/coding-agent/installation - 404` — PEM key loads correctly; 404 means GitHub App not installed on test repo (correct behavior)
- [ ] Conversation view — blocked by GitHub App not installed on test repo + Bug #5/#11

No new bugs found this session.

---

## 2026-04-20 — Session 4

QA run via Playwright MCP. All three services running. Auth session still valid from Session 1.

**Key actions:** Fixed Bug #5/#11 by removing `RepoSelector` and hardcoding `DistruApp/distru`. GitHub App confirmed installed on `DistruApp` org (installation ID 14128506). Session creation for `DistruApp/distru` succeeded for the first time.

### Steps Taken

- [x] Services verified: `GET /health` → `{"status":"ok"}`, web 3001 → 200, tunnel → 200
- [x] Authenticated view renders: "Coding Agent" heading + repo selector with 75+ repos (Bug #5/#11 re-confirmed before fix)
- [x] Bug #5/#11 FIXED: `HomeContent.tsx` updated — `RepoSelector` removed, `repoOwner = 'DistruApp'`, `repoName = 'distru'` hardcoded. Page now renders `DistruApp/distru` directly with "idle" badge.
- [x] Typing in textarea enables Start button — correct
- [x] After Bug #5/#11 fix: `POST /api/threads` → 200 with `threadId`
- [x] DB insert verified: `orchestrator_sessions` row created with correct repo and `status = 'running'`
- [x] Conversation view renders after successful session start — **first time this step passes**
- [ ] SSE stream delivers messages — blocked by Bug #13 (PNA restriction)
- [ ] Status transitions, PR link, message input, session reconnect — blocked by Bug #13

Bugs found this session: #5, #11, #13, #14 → see `qa_log_completed.md`

---

## 2026-04-20 — Session 5

QA run via Playwright MCP. Auth session valid. Services running: API on 8080, web on 3001 (restarted mid-session, see Bug #16), Cloudflare tunnel active.

**Key findings:** Confirmed fixes for Bugs #4, #12, #13, #14. Confirmed SSE stream works end-to-end through proxy. Found Bugs #15, #16, #17.

### Steps Taken

- [x] Services verified: `GET /health` → `{"status":"ok"}`, web 3001 → 200, tunnel → 200
- [x] Authenticated view: "Coding Agent" heading + `DistruApp/distru` hardcoded — zero console errors on fresh page load
- [x] Bug #4 re-QA: Start click with bad session → `status = 'error'`, inline `startError` message shown — **CONFIRMED FIXED**
- [x] Bug #12 re-QA: No unhandled rejection / no Next.js dev overlay — **CONFIRMED FIXED**
- [x] Bug #16 found and FIXED mid-session: web dev server crashed on restart due to broken dev script
- [x] Typing in textarea + key press enables Start button (fill alone doesn't trigger React onChange — test-runner quirk, app is fine)
- [x] Start button enables, disables while `status === 'running'` — correct
- [x] Clicking Start: `POST /api/proxy/threads` → 200 → conversation view renders, feature request appears — proxy works for POST
- [x] SSE stream delivers error event through proxy: status transitions `running` → `error` via SSE — **Bug #13 fix confirmed**
- [x] API process stays alive after graph error (SandboxManager ENOENT on `/app`) — **Bug #14 fix confirmed**
- [x] DB updated: `status = 'error'` after graph failure — **Bug #14 fix confirmed**
- [ ] Error message from graph not displayed in conversation — Bug #15 (open at end of session)
- [ ] Status transitions: `running` → `waiting` → `finished` — blocked: SandboxManager fails locally (`/app` path absent)
- [ ] PR link banner, message input on `waiting`, session reconnect — same blocker

Bugs found this session: #15, #16, #17 → see `qa_log_completed.md` for #16. Bugs #15 and #17 fixed in Session 6, see `qa_log_completed.md`.

---

## 2026-04-26 — Session 6

QA run via Playwright MCP against `https://coding-agent-dev.distru.com`. Auth session initially valid from prior sessions. Services running: API on 8080, web on 3001 (hot-reloading throughout), Cloudflare tunnel active.

**Key findings:** Fixed Bugs #15 and #17 before QA. Discovered session-token 500 on expired GitHub token (Bug #10 partial fix applied mid-session). Discovered `streamIterable is not async iterable` (Bug #18, fixed mid-session). Graph executed successfully for the first time — Claude Code subprocess spawned and ran. Discovered Cloudflare 524 timeout kills long SSE streams (Bug #19, fix applied).

### Steps Taken

- [x] Page load — authenticated state, "Coding Agent" header + "Sign out" button in top-right — Bug #17 fix confirmed present
- [x] `DistruApp/distru` hardcoded (no repo selector dropdown) — correct
- [x] "idle" status badge, textarea, disabled Start button — correct
- [x] Typing in textarea enables Start button — correct
- [x] First Start click: `GET /api/session-token` → 500 — Bug #10 triggered (expired OAuth token, Octokit throw)
  - Inline error shown: "Failed to get session token. Please refresh and try again." — Bug #4/#12 fixes still working
- [x] Bug #10 partial fix applied mid-session: session-token route now catches Octokit errors, falls back to `session.user.name`
- [x] After fix: `GET /api/session-token` → 200, `POST /api/proxy/threads` → 200 — session created
- [x] Conversation view rendered — pre-session form disappeared, user message appeared — correct
- [x] SSE stream returned error: `"TypeError: streamIterable is not async iterable"` — Bug #18 (new)
  - Error content shown in conversation as red system message — **Bug #15 fix confirmed working**
  - Status badge transitioned to `"error"` via SSE — correct
- [x] Bug #18 fix applied mid-session: `await graph.stream()` in `run.ts`
- [x] After Bug #18 fix: Start → session created → status `"running"` → Claude Code subprocess spawned — **graph executing for the first time ever**
- [x] After ~60s: SSE stream returned HTTP 524 — Bug #19 (new); status → `"error"` (incorrect permanent error on transient failure)
- [x] Bug #19 fix applied: SSE keepalive every 30s + client reconnects on transient 5xx
- [x] Sign out button clicked → unauthenticated "Sign in with GitHub" view — **Bug #17 CONFIRMED FIXED**
- [ ] Full E2E: `running` → `waiting` → `finished`, PR link — blocked: requires Railway (SandboxManager needs `/app`)
- [ ] Bug #19 keepalive fix — not yet verified end-to-end (needs >100s run)

Bugs found this session: #10 (partial fix), #18, #19 → see `qa_log_completed.md` for #15, #17, #18. Bugs #10 and #19 remain open above.
