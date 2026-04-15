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
