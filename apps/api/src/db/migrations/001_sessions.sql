CREATE TABLE IF NOT EXISTS orchestrator_sessions (
  "threadId"      TEXT PRIMARY KEY,
  "userId"        TEXT NOT NULL,
  "userLogin"     TEXT NOT NULL,
  "repoOwner"     TEXT NOT NULL,
  "repoName"      TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running',  -- running | waiting | finished | error
  "prUrl"         TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON orchestrator_sessions("userId");
