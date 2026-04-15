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
