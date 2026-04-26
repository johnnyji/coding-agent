# QA Log Instructions

## Files

| File | Purpose |
|---|---|
| `qa_log.md` | Active log — session history and **open bugs only** |
| `qa_log_completed.md` | Archive — all bugs that are fully fixed and verified |

## Running a QA Session

1. Start services locally: API on 8080, web on 3001, Cloudflare tunnel active.
2. Navigate to `https://coding-agent-dev.distru.com` in Playwright MCP.
3. Work through the checklist of steps (see existing sessions for the standard checklist).
4. For each bug found: add it to `qa_log.md` under the current session's "Bugs Found" section with a sequential `Bug #N` number and status `OPEN`.
5. When you fix a bug in the same session: mark it `FIXED` inline but **do not move it yet** — wait until the end of the session so the fix is confirmed.

## Documenting Bugs

Use this format in `qa_log.md`:

```
- [ ] **Bug N** — Short description `OPEN`
  - **Found:** What exactly was observed. Include request/response details, error messages, stack traces.
  - **Suggested fix:** What you think needs to change.
```

When fixed:

```
- [x] **Bug N** — Short description `FIXED`
  - **Found:** (same as above)
  - **Fixed:** What was changed and in which file(s). Include confirmation signal (e.g., "Confirmed: 200 response after fix").
```

## After Each Session — Moving Completed Bugs

At the end of a session (or at the start of the next), move every `[x] FIXED` bug entry from `qa_log.md` into `qa_log_completed.md`. This keeps `qa_log.md` focused on what still needs attention.

**Steps:**
1. Cut each `[x]` bug block from `qa_log.md` (including the `- [x]` line and all sub-bullets).
2. Paste it into `qa_log_completed.md` under the heading for the session it was **fixed** in (add `## Fixed in <date> — Session N` headings as needed).
3. In `qa_log.md`, replace the removed block with a single-line reference: `- Bugs fixed this session: #N, #M → see qa_log_completed.md`

**Do not** delete "Steps Taken" checklists from `qa_log.md` — they are the historical test record and stay forever.

## Standard Checklist (run each session)

- [ ] `GET /health` → `{"status":"ok"}`
- [ ] Unauthenticated state: "Sign in with GitHub" button centered
- [ ] OAuth flow: redirects to GitHub, back to app, session established
- [ ] Authenticated state: "Coding Agent" header + "Sign out" button
- [ ] `DistruApp/distru` hardcoded (no repo selector)
- [ ] "idle" status badge, textarea, disabled Start button on fresh load
- [ ] Typing in textarea enables Start button
- [ ] Clicking Start: session-token 200, POST /api/threads 200
- [ ] Status transitions "idle" → "running", conversation view renders
- [ ] SSE stream connects via proxy (`/api/proxy/threads/:id/stream`)
- [ ] Graph runs: SSE messages/status events arrive in UI
- [ ] Status transitions to `waiting`: user input enabled
- [ ] Sending a message resumes the graph
- [ ] Status transitions to `finished`: PR link banner appears
- [ ] Sign out button: redirects to unauthenticated state, no errors
- [ ] Session survives browser close and reconnect
