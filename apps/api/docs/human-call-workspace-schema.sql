-- Additive only. Apply before deploying the workspace API with synchronization disabled.
-- No call data is replaced; older sessions have an empty workspace and no tools.
ALTER TABLE human_call_sessions
  ADD COLUMN IF NOT EXISTS workspace jsonb NOT NULL DEFAULT '{}'::jsonb;
