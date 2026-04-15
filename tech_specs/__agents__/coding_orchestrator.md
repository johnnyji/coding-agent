# Coding Orchestrator — Tech Spec

> IMPORTANT: If you are an implementor agent, first read `tech_specs/__TEMPLATE__.md` and fully understand how to work with this tech spec before doing anything else.

## What are we building?

A web-based coding orchestrator that lets engineers describe a feature in a chat UI and then autonomously writes a tech spec, implements it across multiple Claude Code sessions, runs QA with Playwright, and opens a GitHub PR when finished.

### User Flow

1. Engineer opens the web app, signs in with GitHub OAuth, and selects the target repository.
2. Engineer types a feature request in the chat UI (e.g. "Add bulk CSV export to the orders table").
3. The orchestrator spins up a sandboxed clone of the repo, creates a new git branch, and invokes the **Tech Spec Agent** — a Claude Code subprocess that writes a structured tech spec (following `docs/tech_spec/__AI_TEMPLATE__.md` in the cloned repo) and commits it to the branch.
4. Control returns to the **Delegation Agent**, a lightweight Claude call (no subprocess) that reads the current tech spec and decides the next action:
   - `IMPLEMENT` — there are unfinished Asks in the spec; spawn the Implementation Agent.
   - `BUG_FIX` — tests are failing or bugs were reported by QA; spawn the Bug Fix Agent.
   - `QA` — all sections are marked complete; spawn the QA Agent to run Playwright.
   - `ASK_USER_QUESTION` — a Blocking Question in the spec requires human input; pause and surface the question in the chat UI.
   - `FINISH` — QA passed with no bugs; open the GitHub PR and end the session.
5. The orchestrator loops through delegation decisions until `FINISH`.
6. Every step streams output back to the chat UI in real time. If the engineer closes the browser, the session continues and they can reconnect.

### Architecture Overview

```
Browser (Next.js + ai-elements)
  │  SSE stream / POST messages
  ▼
API Service (Hono, Railway)
  ├── LangGraph graph (Postgres checkpointer)
  │     ├── techSpecNode      → Claude Code subprocess
  │     ├── delegateNode      → Claude API call
  │     ├── implementNode     → Claude Code subprocess
  │     ├── bugFixNode        → Claude Code subprocess
  │     ├── qaNode            → Claude Code subprocess (Playwright MCP)
  │     ├── askUserNode       → LangGraph interrupt()
  │     └── openPrNode        → GitHub REST API
  └── Sandbox Manager
        ├── git worktree per thread (from shared mirror clone)
        ├── Postgres DB per thread
        └── Redis key prefix per thread
```

### Sandboxing Strategy

The Railway API service hosts all sandboxes directly (no Docker-in-Docker). Each session gets:
- A **git worktree** checked out from a shared bare mirror of the target repo (fast, avoids full re-clones).
- A dedicated **Postgres database** (`distru_session_<threadId>`) created once per thread and reused across all agent invocations within that thread (implement, QA, bug fix, etc.).
- A dedicated **Redis key prefix** (`session:<threadId>:`) for cache isolation.
- A dedicated **port** (allocated from a pool) for the dev server during QA.

The Railway service image must include: Node 20, Elixir/OTP (for running Distru), `claude` CLI, and Git.

Up to 5 concurrent sandboxes are supported. Sandboxes are torn down when the thread ends or after a 4-hour idle timeout.

### Key Technology Decisions

| Concern | Choice | Reason |
|---|---|---|
| Orchestration | LangGraph (TypeScript) | Built-in Postgres checkpointing, interrupt/resume, streaming |
| LLM execution | Claude Code SDK (`@anthropic-ai/claude-code`) | Autonomous file editing + shell execution |
| LLM calls (delegation) | LangChain + Anthropic SDK | Prompt caching, structured output |
| Web framework (API) | Hono | Lightweight, first-class SSE/streaming |
| Web framework (UI) | Next.js | AI SDK compatibility, SSE consumption |
| UI components | ai-elements (shadcn-style CLI) + Vercel AI SDK | Chat UI primitives copied into project, `useChat` hook |
| Auth | NextAuth.js with GitHub OAuth | Per-user GitHub tokens |
| Git bot identity | GitHub App (bot account) | Simpler than per-user git config |
| Database (orchestrator) | Postgres on Railway | LangGraph checkpointer requirement |
| Deployment | Railway | Monorepo support, volume mounts, managed Postgres |
| QA browser automation | Playwright MCP (via Claude Code) | Already in Claude Code's tool suite |

---

## Feature Sections

---

### Section 1: Monorepo Scaffold & Shared Types

#### Asks

- [ ] Initialize a `pnpm` monorepo at the repo root with `pnpm-workspace.yaml` listing `apps/*` and `packages/*`.
- [ ] Create `apps/api/` — a Hono TypeScript app. Set up `package.json`, `tsconfig.json` (strict mode, `moduleResolution: bundler`), and `src/index.ts` with a basic `GET /health` route.
- [ ] Create `apps/web/` — a Next.js 14 app (App Router). Set up with TypeScript and Tailwind CSS.
- [ ] Create `packages/shared/` — a plain TypeScript package (no framework). This holds types shared between `apps/api` and `apps/web`.
- [ ] In `packages/shared/src/state.ts`, define the canonical `OrchestratorState` interface:
  ```ts
  export type DelegationDecision =
    | 'IMPLEMENT'
    | 'BUG_FIX'
    | 'QA'
    | 'ASK_USER_QUESTION'
    | 'FINISH'

  export interface OrchestratorState {
    // Session identity
    threadId: string
    userId: string        // GitHub user ID
    userLogin: string     // GitHub username

    // Target repo
    repoOwner: string
    repoName: string
    featureRequest: string

    // Branch & tech spec
    gitBranch: string             // e.g. "feature/bulk-csv-export"
    techSpecPath: string          // relative path inside repo, e.g. "docs/tech_spec/__agents__/bulk_csv_export.md"
    techSpecContent: string       // latest full content of the spec file

    // Sandbox
    sandboxPath: string           // absolute path to worktree on Railway filesystem
    sandboxDbName: string         // e.g. "distru_session_abc123"
    sandboxRedisPrefix: string    // e.g. "session:abc123:"
    sandboxPort: number           // port reserved for QA dev server

    // Orchestration
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
    delegationDecision: DelegationDecision | null
    userQuestion: string | null   // populated when delegateNode returns ASK_USER_QUESTION
    iterationCount: number
    maxIterations: number         // default 20; safety ceiling
    lastAgentOutput: string       // stdout from the last Claude Code subprocess

    // Result
    prUrl: string | null
  }
  ```
- [ ] Export `OrchestratorState` and `DelegationDecision` from `packages/shared/src/index.ts`.
- [ ] Add root-level `package.json` scripts: `dev`, `build`, `lint`, `check-types`, `test`.
- [ ] Add `turbo.json` (or skip Turbo and just use `pnpm -r`) — keep it simple, no over-engineering.
- [ ] Add a root `.gitignore` covering `node_modules`, `.next`, `dist`, `.env*`, `sandboxes/`.
- [ ] Add a root `.env.example` listing all required env vars (values left blank):
  ```
  # GitHub App
  GITHUB_APP_ID=
  GITHUB_APP_PRIVATE_KEY=
  GITHUB_CLIENT_ID=
  GITHUB_CLIENT_SECRET=

  # Database (orchestrator)
  DATABASE_URL=

  # Redis
  REDIS_URL=

  # Claude
  ANTHROPIC_API_KEY=

  # Sandbox
  SANDBOX_BASE_PATH=/app/sandboxes
  SANDBOX_MIRROR_PATH=/app/mirrors
  SANDBOX_PORT_RANGE_START=5100
  SANDBOX_PORT_RANGE_END=5199

  # App-specific (Distru sandbox)
  # These are injected into config/env/dev.env and config/env/test.env at sandbox creation time.
  # Engineers normally set these manually on their local machines; here they live as Railway env vars.
  DISTRU_SECRET_KEY_BASE=
  DISTRU_AWS_ACCESS_KEY_ID=
  DISTRU_AWS_SECRET_ACCESS_KEY=
  DISTRU_AWS_REGION=
  DISTRU_S3_BUCKET=
  DISTRU_STRIPE_SECRET_KEY=
  DISTRU_STRIPE_PUBLISHABLE_KEY=
  DISTRU_SENDGRID_API_KEY=
  # Add any other vars that engineers set in config/env/dev.env locally
  ```

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (no tests yet — check complete).

#### Completed

*(blank — to be filled by implementor agent)*

#### Blocking Questions

*(blank — to be filled by implementor agent)*

---

### Section 2: Postgres & LangGraph Checkpointer

#### Asks

- [ ] In `apps/api`, install: `@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres`, `pg`, `@types/pg`.
- [ ] Create `apps/api/src/db/client.ts` that exports a `pg.Pool` instance using `process.env.DATABASE_URL`. The pool should be a singleton (module-level), with `max: 10`.
- [ ] Create `apps/api/src/db/migrations/001_sessions.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS orchestrator_sessions (
    thread_id       TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    user_login      TEXT NOT NULL,
    repo_owner      TEXT NOT NULL,
    repo_name       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'running',  -- running | waiting | finished | error
    pr_url          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON orchestrator_sessions(user_id);
  ```
- [ ] Create `apps/api/src/db/migrate.ts` — a script that reads all `.sql` files from `src/db/migrations/` in order and executes them. It must be idempotent (using `IF NOT EXISTS`). Add a `package.json` script `db:migrate` that runs this file with `tsx`.
- [ ] Create `apps/api/src/db/checkpointer.ts` that exports an async `getCheckpointer()` function returning a `PostgresSaver` from `@langchain/langgraph-checkpoint-postgres`, configured with the shared pool. Call `checkpointer.setup()` on first use to create LangGraph's internal tables.
- [ ] Write tests in `apps/api/src/db/__tests__/migrate.test.ts` verifying that running migrations twice is idempotent (use a test Postgres DB via `DATABASE_URL` env var).

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 3: GitHub OAuth & Repo Selection API

#### Asks

- [ ] In `apps/web`, install: `next-auth@beta`, `@octokit/rest`, `@octokit/auth-app`.
- [ ] In `apps/api`, install: `@octokit/rest`, `@octokit/auth-app`.
- [ ] Configure NextAuth in `apps/web/src/app/api/auth/[...nextauth]/route.ts` with the GitHub provider. Store the user's GitHub `access_token` in the session. Use Postgres as the session adapter (install `@auth/pg-adapter`).
- [ ] Create `apps/web/src/app/api/repos/route.ts` — a `GET` handler that uses the user's GitHub access token to list their accessible repos (via Octokit `repos.listForAuthenticatedUser`). Return `{ repos: [{ owner, name, fullName, private }] }`.
- [ ] In `apps/api`, create `src/github/appClient.ts` — exports `getInstallationOctokit(repoOwner: string, repoName: string)` which authenticates as the GitHub App for the given repo installation. This is used by the Open PR node for bot-authored actions.
- [ ] Create `apps/web/src/components/RepoSelector.tsx` — a dropdown that fetches from `/api/repos` and lets the user pick a repo. On select, stores `{ repoOwner, repoName }` in component state and passes it up to the parent page.
- [ ] Create `apps/web/src/app/page.tsx` — renders the `RepoSelector`. Once a repo is selected, renders the chat UI (placeholder for now — a `<div>Chat goes here</div>`). If the user is not signed in, redirect to the sign-in page.
- [ ] Protect the page with NextAuth's `getServerSession` — unauthenticated users see a "Sign in with GitHub" button.
- [ ] Write a test in `apps/api/src/github/__tests__/appClient.test.ts` that mocks Octokit and verifies `getInstallationOctokit` constructs the auth correctly.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 4: Session Sandbox Manager

#### Asks

This is the most infrastructure-heavy section. The Sandbox Manager handles the full lifecycle of a per-thread isolated environment.

- [ ] In `apps/api`, create `src/sandbox/SandboxManager.ts`. It must export a singleton class `SandboxManager` with the following public methods:

  **`async create(threadId: string, repoOwner: string, repoName: string, branch: string): Promise<SandboxInfo>`**
  1. Ensure a bare mirror of `github.com/{repoOwner}/{repoName}` exists at `$SANDBOX_MIRROR_PATH/{repoOwner}/{repoName}.git`. If not, run `git clone --mirror <repo-url> <path>`. If it does exist, run `git remote update` to fetch latest.
  2. Create a git worktree at `$SANDBOX_BASE_PATH/{threadId}/` from the mirror: `git worktree add --no-checkout <path> <branch>`. If the branch doesn't exist yet, create it from `main`: `git worktree add -b <branch> <path> main`.
  3. Checkout the worktree: `git -C <path> checkout`.
  4. Allocate a port from the pool (`SANDBOX_PORT_RANGE_START` to `SANDBOX_PORT_RANGE_END`) that is not currently in use. Track allocated ports in a `Map<threadId, port>`.
  5. Create two Postgres databases for the session: `CREATE DATABASE distru_session_{sanitizedThreadId}` (dev) and `CREATE DATABASE distru_session_{sanitizedThreadId}_test` (test, used by `mix test`).
  6. Write `config/env/dev.env` inside the worktree (this file is gitignored in Distru; engineers normally write it manually). Populate it with all `DISTRU_*` Railway env vars (stripped of the `DISTRU_` prefix) plus session-specific overrides:
     ```
     DATABASE_URL=postgres://...distru_session_{sanitizedThreadId}
     REDIS_URL=${process.env.REDIS_URL}
     REDIS_KEY_PREFIX=session:{threadId}:
     SECRET_KEY_BASE=${process.env.DISTRU_SECRET_KEY_BASE}
     AWS_ACCESS_KEY_ID=${process.env.DISTRU_AWS_ACCESS_KEY_ID}
     AWS_SECRET_ACCESS_KEY=${process.env.DISTRU_AWS_SECRET_ACCESS_KEY}
     AWS_REGION=${process.env.DISTRU_AWS_REGION}
     S3_BUCKET=${process.env.DISTRU_S3_BUCKET}
     STRIPE_SECRET_KEY=${process.env.DISTRU_STRIPE_SECRET_KEY}
     STRIPE_PUBLISHABLE_KEY=${process.env.DISTRU_STRIPE_PUBLISHABLE_KEY}
     SENDGRID_API_KEY=${process.env.DISTRU_SENDGRID_API_KEY}
     PORT={allocatedPort}
     MIX_ENV=dev
     # Add any other vars engineers set in config/env/dev.env locally
     ```
  6a. Write `config/env/test.env` inside the worktree with the same base vars, but override `MIX_ENV=test` and `DATABASE_URL` to point at `distru_session_{sanitizedThreadId}_test` (Distru's test DB is separate from the dev DB). Do **not** set `PORT` or `REDIS_KEY_PREFIX` in the test env file — Distru manages those for test runs internally.
  7. Run `mix deps.get` and `yarn install --frozen-lockfile` inside the worktree (with a 10-min timeout each).
  8. Run `mix ecto.setup` (create + migrate + seed) inside the worktree.
  9. Return `SandboxInfo`:
     ```ts
     interface SandboxInfo {
       sandboxPath: string
       sandboxDbName: string
       sandboxRedisPrefix: string
       sandboxPort: number
     }
     ```

  **`async destroy(threadId: string): Promise<void>`**
  1. Kill any processes using the allocated port (the QA dev server if still running).
  2. Run `git worktree remove --force <path>` from the mirror.
  3. Drop both Postgres databases: `DROP DATABASE IF EXISTS distru_session_{sanitizedThreadId}` and `DROP DATABASE IF EXISTS distru_session_{sanitizedThreadId}_test`.
  4. Delete the worktree directory from the filesystem.
  5. Release the port back to the pool.

  **`getSandboxInfo(threadId: string): SandboxInfo | null`**
  - Returns sandbox info from an in-memory Map if it exists.

- [ ] Create `src/sandbox/runInSandbox.ts` — exports `runInSandbox(sandboxPath: string, command: string, timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number }>`. This runs a shell command inside the worktree directory with the worktree's `.env` loaded, a timeout (default 15 min), and streams stdout/stderr to a callback.

- [ ] Create `src/sandbox/__tests__/SandboxManager.test.ts` with tests that mock `git` and `pg` calls and verify:
  - Port allocation is unique across concurrent calls.
  - `destroy` frees the port back to the pool.
  - Sanitized thread IDs produce valid Postgres DB names.

- [ ] Add a `SandboxManager` idle timeout: if a sandbox has had no activity for 4 hours (tracked by `lastActivityAt` in the Map), call `destroy` automatically. Use a `setInterval` check every 30 minutes.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 5: LangGraph Graph Skeleton & Routing

#### Asks

- [ ] In `apps/api`, install: `@langchain/langgraph`, `@langchain/core`.
- [ ] Create `src/graph/state.ts` — defines the LangGraph `Annotation` object from `OrchestratorState` (imported from `packages/shared`). Use `Annotation.Root({...})` with appropriate reducers (messages use `messagesStateReducer`, most other fields use last-write-wins).
- [ ] Create `src/graph/nodes/` directory with one stub file per node: `techSpec.ts`, `delegate.ts`, `implement.ts`, `bugFix.ts`, `qa.ts`, `askUser.ts`, `openPr.ts`. Each stub must:
  - Export an async function matching `(state: typeof GraphState.State) => Partial<typeof GraphState.State>`.
  - Log `"[nodeName] called"` and return the state unchanged.
- [ ] Create `src/graph/router.ts` — exports `routeFromDelegate(state): string` that maps `state.delegationDecision` to a node name:
  ```ts
  IMPLEMENT        → 'implement'
  BUG_FIX          → 'bugFix'
  QA               → 'qa'
  ASK_USER_QUESTION → 'askUser'
  FINISH           → 'openPr'
  null             → throw Error (should never happen)
  ```
  Also include a guard: if `state.iterationCount >= state.maxIterations`, always route to `'openPr'` (safety escape hatch).
- [ ] Create `src/graph/graph.ts` — assembles and compiles the full LangGraph `StateGraph`:
  ```
  START → techSpec → delegate
  delegate --[routeFromDelegate]-→ implement | bugFix | qa | askUser | openPr
  implement → delegate
  bugFix    → delegate
  qa        → delegate
  askUser   → delegate
  openPr    → END
  ```
  Wire up the Postgres checkpointer from Section 2.
- [ ] Create `src/graph/run.ts` — exports `startThread(input: StartInput): Promise<string>` (returns `threadId`) and `resumeThread(threadId: string, userMessage: string): Promise<void>`. Both invoke the compiled graph with the appropriate config (`{ configurable: { thread_id: threadId } }`).
- [ ] Write a test in `src/graph/__tests__/router.test.ts` covering all routing cases including the maxIterations escape hatch.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 6: Tech Spec Agent Node

#### Asks

- [ ] In `apps/api`, install: `@anthropic-ai/claude-code`.
- [ ] Implement `src/graph/nodes/techSpec.ts`. This node must:
  1. Call `SandboxManager.create(threadId, repoOwner, repoName, branch)` to provision the sandbox. The branch name should be derived from the feature request: slugify it and prefix with `feature/` (e.g. `feature/bulk-csv-export`). Store the branch in state.
  2. Read the contents of `docs/tech_spec/__AI_TEMPLATE__.md` from the worktree to include in the prompt.
  3. Build a prompt instructing Claude Code to (all paths are relative to the cloned worktree at `state.sandboxPath` — never the orchestrator repo):
     - Read `docs/tech_spec/__AI_TEMPLATE__.md` for the spec format.
     - Write a complete tech spec for the feature request at `docs/tech_spec/__agents__/<slug>.md`.
     - Commit the new spec file with message `chore: add tech spec for <featureRequest>`.
     - The spec's base branch for the PR should be `main`.
  4. Invoke Claude Code via `query()` from `@anthropic-ai/claude-code` with:
     - `cwd` set to `state.sandboxPath`
     - `dangerouslySkipPermissions: true`
     - A reasonable `maxTurns` (e.g. 30)
  5. Stream the output and accumulate it into `lastAgentOutput`.
  6. After Claude Code finishes, read the written spec file from disk and store its content in `state.techSpecContent` and path in `state.techSpecPath`.
  7. Update `orchestrator_sessions` in Postgres: set `status = 'running'`.
  8. Return updated state.
- [ ] Create `src/graph/prompts/techSpec.ts` — the prompt template as a function that takes `{ featureRequest, templateContent }` and returns a string. Keep prompts in separate files for maintainability.
- [ ] Write a test in `src/graph/nodes/__tests__/techSpec.test.ts` that mocks `query` from `@anthropic-ai/claude-code` and `SandboxManager` and verifies:
  - The spec file path is correctly computed.
  - State fields `techSpecContent`, `techSpecPath`, `gitBranch` are populated.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 7: Delegation Agent Node

#### Asks

The delegation agent is a lightweight Claude API call (not Claude Code) that reads the current tech spec and returns a structured decision. It uses prompt caching since the tech spec content is large and repeated on every loop iteration.

- [ ] In `apps/api`, install: `@langchain/anthropic`, `zod`.
- [ ] Implement `src/graph/nodes/delegate.ts`. This node must:
  1. Re-read the tech spec file from disk (so it always has the latest content after an agent edits it). Update `state.techSpecContent`.
  2. Call the Anthropic API (via `@langchain/anthropic` `ChatAnthropic`) with:
     - Model: `claude-sonnet-4-6` (or latest available)
     - Prompt caching enabled on the tech spec content (`cache_control: { type: 'ephemeral' }`)
     - A system prompt explaining the delegation role
     - The current tech spec content as a cached user message
  3. Use structured output (via `withStructuredOutput` + Zod schema) to enforce the response shape:
     ```ts
     z.object({
       decision: z.enum(['IMPLEMENT', 'BUG_FIX', 'QA', 'ASK_USER_QUESTION', 'FINISH']),
       reasoning: z.string(),
       userQuestion: z.string().optional(), // only when decision is ASK_USER_QUESTION
     })
     ```
  4. Store `decision` in `state.delegationDecision`, `userQuestion` in `state.userQuestion`.
  5. Increment `state.iterationCount`.
  6. Append the delegation reasoning to `state.messages` as an assistant message (so it appears in the chat UI).
  7. Return updated state.
- [ ] Create `src/graph/prompts/delegate.ts` — the system prompt explaining:
  - Scan the tech spec for the first section with incomplete Asks (unchecked `- [ ]` items).
  - If incomplete Asks remain → `IMPLEMENT`.
  - If all Asks complete but QA Checklist is empty → `QA`.
  - If QA found bugs (Bugs section is non-empty and not all resolved) → `BUG_FIX`.
  - If QA passed cleanly → `FINISH`.
  - If any Blocking Questions are unanswered → `ASK_USER_QUESTION`.
- [ ] Write tests in `src/graph/nodes/__tests__/delegate.test.ts` that mock `ChatAnthropic` and verify all 5 decision paths.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 8: Implementation & Bug Fix Agent Nodes

#### Asks

Both nodes follow the same Claude Code subprocess pattern; they differ only in their prompt.

- [ ] Implement `src/graph/nodes/implement.ts`. This node must:
  1. Read `state.techSpecContent` (already fresh from the delegate node).
  2. Build the implementation prompt (see `src/graph/prompts/implement.ts`).
  3. Invoke Claude Code via `query()` with `cwd: state.sandboxPath`, `dangerouslySkipPermissions: true`, `maxTurns: 80`.
  4. Stream output and accumulate into `lastAgentOutput`.
  5. After Claude Code finishes, re-read the tech spec file from disk and update `state.techSpecContent` (the agent will have checked off completed Asks and filled in Blocking Questions).
  6. Append a summary message to `state.messages`.
  7. Return updated state.

- [ ] Create `src/graph/prompts/implement.ts` with the following prompt structure:
  - You are a senior engineer implementing one section of a tech spec in the cloned worktree (all paths are relative to that repo, never the orchestrator repo).
  - Read `docs/tech_spec/__AI_TEMPLATE__.md` for instructions on how to work with this spec.
  - The full current spec content is included (for caching).
  - Follow the HARD STOP RULE: implement exactly one section, update the spec file (Completed + Blocking Questions), commit changes, then stop.
  - Commit message format: `feat(<section-slug>): <one-line description>`.

- [ ] Implement `src/graph/nodes/bugFix.ts`. Same structure as `implement.ts` but uses a different prompt.

- [ ] Create `src/graph/prompts/bugFix.ts`:
  - You are a senior engineer fixing bugs found during QA.
  - The Bugs section of the tech spec lists what was found.
  - Fix the bugs, update the Bugs section marking them resolved, commit changes.
  - Commit message format: `fix: <description>`.

- [ ] Both nodes should handle Claude Code process failures (non-zero exit, timeout) by appending an error message to `state.messages` and setting `state.delegationDecision = null` so the delegate node re-evaluates.

- [ ] Write tests in `src/graph/nodes/__tests__/implement.test.ts` and `bugFix.test.ts` that mock `query` and verify state updates.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 9: QA Agent Node

#### Asks

The QA agent starts the Distru app inside the sandbox and uses Claude Code (with Playwright MCP enabled) to run through the QA checklist in the tech spec.

- [ ] Implement `src/graph/nodes/qa.ts`. This node must:
  1. Start the Distru dev server inside the sandbox via `runInSandbox`:
     - Run `mix phx.server` with `PORT={state.sandboxPort}` in the background (detached process, PID stored in sandbox info).
     - Poll `http://localhost:{sandboxPort}/health` every 5 seconds for up to 3 minutes until the server responds. If it doesn't start, append an error to messages and return.
  2. Build the QA prompt (see `src/graph/prompts/qa.ts`).
  3. Invoke Claude Code via `query()` with:
     - `cwd: state.sandboxPath`
     - `dangerouslySkipPermissions: true`
     - `maxTurns: 60`
     - MCP config enabling the Playwright MCP server (configure via `mcpServers` option in Claude Code SDK — point to the installed `@playwright/mcp` package)
  4. Stream output and accumulate into `lastAgentOutput`.
  5. After Claude Code finishes, re-read the tech spec to capture any Bugs the agent wrote.
  6. Kill the dev server process.
  7. Return updated state.

- [ ] Create `src/graph/prompts/qa.ts`:
  - You are a QA engineer using Playwright to test a feature.
  - Read the QA Checklist in the tech spec and execute each item.
  - The app is running at `http://localhost:{port}`.
  - The DB reflects the current state of this session — seed data was applied at session start and may have been modified by previous QA runs. Account for this when writing test steps (e.g. don't assume emails are unique if a prior run may have used them).
  - For each bug found, add it to the Bugs section of the spec file and mark it unresolved.
  - If all checks pass with no bugs, write "All checks passed" in the QA Checklist.
  - Commit all spec updates.

- [ ] In `src/sandbox/SandboxManager.ts`, add a `devServerPid` field to `SandboxInfo` (optional `number`), and add a `setDevServerPid(threadId, pid)` method.

- [ ] Write tests in `src/graph/nodes/__tests__/qa.test.ts` that mock `runInSandbox`, the health check poll, and `query`. Verify that the dev server is killed even if Claude Code throws.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 10: Ask User Question (Interrupt & Resume)

#### Asks

When the delegation agent returns `ASK_USER_QUESTION`, the graph must pause, surface the question in the chat UI, and wait for the engineer's answer before continuing.

- [ ] Implement `src/graph/nodes/askUser.ts`. This node must:
  1. Append the question to `state.messages` as an assistant message so the chat UI displays it.
  2. Call `interrupt(state.userQuestion)` from `@langchain/langgraph`. This suspends the graph and persists state via the Postgres checkpointer.
  3. When resumed (LangGraph automatically calls the node again with the interrupt value), the resume value is the engineer's answer. Store it in state and clear `state.userQuestion`.
  4. Append the answer to `state.messages` as a user message.
  5. Reset `state.delegationDecision` to `null` so the delegate node re-reads the spec.

- [ ] In `src/graph/run.ts`, update `resumeThread(threadId, userMessage)` to:
  1. Lookup the thread's current state via `graph.getState({ configurable: { thread_id: threadId } })`.
  2. Call `graph.invoke(new Command({ resume: userMessage }), { configurable: { thread_id: threadId } })` to resume the interrupted graph.

- [ ] Update the `orchestrator_sessions` table in Postgres: when entering `askUser`, set `status = 'waiting'`. On resume, set `status = 'running'`.

- [ ] Write tests in `src/graph/nodes/__tests__/askUser.test.ts` verifying interrupt is called with the question and that resuming properly populates messages.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 11: Open PR & Finish Node

#### Asks

- [ ] Implement `src/graph/nodes/openPr.ts`. This node must:
  1. Get the installation Octokit client from `getInstallationOctokit(repoOwner, repoName)`.
  2. Push the feature branch to GitHub: run `git push origin <branch>` inside the sandbox via `runInSandbox`.
  3. Call `octokit.pulls.create` to open a PR:
     - `title`: derived from the feature request (first 70 chars, title-cased).
     - `body`: constructed from the tech spec's "What are we building?" section + a footer noting the initiating engineer (`state.userLogin`) and that it was generated by the coding orchestrator.
     - `head`: `state.gitBranch`
     - `base`: `main`
  4. Store the PR URL in `state.prUrl`.
  5. Append a final message to `state.messages`: `"PR opened: {prUrl}"`.
  6. Update `orchestrator_sessions`: set `status = 'finished'`, `pr_url = {prUrl}`.
  7. Call `SandboxManager.destroy(threadId)` to tear down the sandbox.
  8. Return updated state.

- [ ] Write tests in `src/graph/nodes/__tests__/openPr.test.ts` mocking Octokit and `runInSandbox`. Verify the PR body contains the engineer's login and the feature request summary.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 12: Streaming Chat API

#### Asks

The API service exposes HTTP endpoints that the Next.js frontend calls. The primary mechanism for real-time output is SSE.

- [ ] In `apps/api/src/index.ts`, add the following Hono routes:

  **`POST /api/threads`**
  - Body: `{ repoOwner, repoName, featureRequest }`
  - Auth: validate a session token (JWT signed with `NEXTAUTH_SECRET`, passed in `Authorization: Bearer <token>` header). Extract `userId` and `userLogin` from it.
  - Call `startThread(...)` which creates a LangGraph thread and starts the graph running in the background (do not await completion).
  - Insert a row into `orchestrator_sessions`.
  - Return `{ threadId }` immediately.

  **`GET /api/threads/:threadId/stream`**
  - Upgrade to SSE (`Content-Type: text/event-stream`).
  - Auth: same JWT validation.
  - Subscribe to LangGraph stream events for the thread using `graph.streamEvents(null, { version: 'v2', configurable: { thread_id: threadId } })`.
  - Forward each event as an SSE `data:` message in the shape `{ type: 'message' | 'status' | 'error', content: string }`.
  - On client disconnect, stop streaming but do NOT stop the graph (it continues in the background).
  - When the graph emits `on_chain_end` for the `openPr` node, send a final `{ type: 'finish', prUrl: string }` event and close the stream.

  **`POST /api/threads/:threadId/messages`**
  - Body: `{ message: string }`
  - Auth: same JWT validation. Verify the thread belongs to this user.
  - Call `resumeThread(threadId, message)`.
  - Return `{ ok: true }`.

  **`GET /api/threads/:threadId`**
  - Auth: same JWT validation.
  - Return the row from `orchestrator_sessions` + the current `messages` array from LangGraph state.

- [ ] Add CORS middleware to the Hono app allowing requests from the Next.js app origin (configurable via `ALLOWED_ORIGIN` env var).

- [ ] Add a shared `src/auth/validateSession.ts` middleware that validates the JWT and attaches `userId`/`userLogin` to the Hono context. All `/api/threads` routes must use this middleware.

- [ ] Write integration tests in `src/__tests__/api.test.ts` for the `POST /api/threads` and `POST /api/threads/:threadId/messages` routes, mocking LangGraph.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 13: Chat UI

#### Asks

- [ ] In `apps/web`, install: `ai`, `@ai-sdk/react`, `eventsource-parser`. Also initialize shadcn/ui (`npx shadcn@latest init`) and Tailwind CSS 4 if not already present — these are required by ai-elements.
- [ ] Add ai-elements components via the CLI (these are copied into the project as local files, not npm packages): `npx ai-elements@latest add message conversation prompt-input`. Components will live at `@/components/ai-elements/`. Import them as e.g. `import { Message } from "@/components/ai-elements/message"`.
- [ ] Create `apps/web/src/hooks/useOrchestrator.ts` — a custom hook that:
  - Manages thread state: `{ threadId, messages, status, prUrl, isStreaming }`.
  - Exposes `startSession(repoOwner, repoName, featureRequest)`:
    1. `POST /api/threads` → get `threadId`.
    2. Open an `EventSource` to `GET /api/threads/{threadId}/stream`.
    3. On each SSE event, append to `messages` or update `status`/`prUrl`.
    4. On disconnect, set `isStreaming = false`.
  - Exposes `sendMessage(message: string)`:
    1. `POST /api/threads/{threadId}/messages`.
    2. Re-open the SSE stream if it was closed.
  - Handles reconnection: on `EventSource` error, wait 2 seconds and reopen.

- [ ] Create `apps/web/src/components/ChatInterface.tsx` — the main chat component. Uses `useOrchestrator`. Renders:
  - A scrollable message list using ai-elements' `<Messages>` or equivalent component. Assistant messages stream in character by character (use a simple state-based approach, not AI SDK streaming — since we're consuming SSE manually).
  - A text input at the bottom (disabled unless `status === 'waiting'` for user input, or the session hasn't started yet).
  - A "Start" button (shown before a session starts) and a status badge showing current graph status.
  - A banner with a link to the PR when `status === 'finished'`.

- [ ] Update `apps/web/src/app/page.tsx` to render `<ChatInterface />` after a repo is selected.

- [ ] Create `apps/web/src/app/api/session-token/route.ts` — a `GET` handler that returns a short-lived JWT (signed with `NEXTAUTH_SECRET`) embedding the user's GitHub ID and login. The `useOrchestrator` hook fetches this token to use in `Authorization` headers when calling the API service.

- [ ] Basic responsive styling with Tailwind. No need for a design system beyond ai-elements.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests — add at least one smoke test for `useOrchestrator`).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

### Section 14: Railway Deployment

#### Asks

- [ ] Create `apps/api/Dockerfile`. It must install:
  - Node 20 (via official Node image)
  - Erlang/OTP 25 + Elixir 1.15.4 (via `apt` or `asdf`)
  - `mix` and `hex`
  - `yarn` and `pnpm`
  - Git
  - The `claude` CLI: `npm install -g @anthropic-ai/claude-code`
  - The Playwright MCP server: `npm install -g @playwright/mcp`
  - Playwright browsers: `npx playwright install --with-deps chromium`
  - The API app itself: `pnpm install --frozen-lockfile && pnpm build`
  - Expose port `8080`.
  - Entrypoint: `node dist/index.js`

- [ ] Create `apps/web/Dockerfile` — standard Next.js production Dockerfile (Node 20, `pnpm install`, `pnpm build`, `node .next/standalone/server.js`). Expose port `3000`.

- [ ] Create `railway.toml` at the repo root:
  ```toml
  [[services]]
  name = "api"
  dockerfile = "apps/api/Dockerfile"
  healthcheck = "/health"
  
  [[services]]
  name = "web"
  dockerfile = "apps/web/Dockerfile"
  healthcheck = "/"
  
  [[services]]
  name = "postgres"
  image = "postgres:15"
  
  [[volumes]]
  name = "sandboxes"
  mountPath = "/app/sandboxes"
  service = "api"
  
  [[volumes]]
  name = "mirrors"
  mountPath = "/app/mirrors"
  service = "api"
  ```
  (Adjust syntax to match current Railway TOML spec.)

- [ ] Create `apps/api/src/db/migrate.ts` startup call: in `src/index.ts`, run migrations before starting the Hono server (`await runMigrations()`).

- [ ] Document all required Railway environment variables in `DEPLOYMENT.md` (only create this file, no other docs):
  - `DATABASE_URL` (Railway auto-provides from the Postgres service)
  - `REDIS_URL`
  - `ANTHROPIC_API_KEY`
  - `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (for NextAuth)
  - `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
  - `SANDBOX_SECRET_KEY_BASE`
  - `ALLOWED_ORIGIN` (the web app's Railway URL)
  - `API_URL` (the api app's Railway URL, used by the web app)

- [ ] In `apps/web`, add `API_URL` to the Next.js env config so the frontend knows where to call the API service.

#### Post Changes Checklist

1. No GQL schema changes — check complete.
2. Run `pnpm -r build` (fix any build errors).
3. Run `pnpm -r lint` (fix any errors).
4. Run `pnpm -r check-types` (fix any type errors).
5. Run `pnpm -r test` (fix failing tests).

#### Completed

*(blank)*

#### Blocking Questions

*(blank)*

---

## QA Checklist

*(to be filled by the QA agent after all sections are complete)*

## Bugs

*(to be filled by the QA agent)*
