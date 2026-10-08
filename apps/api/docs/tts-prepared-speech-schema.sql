-- Reviewed additive delta. Apply to the confirmed target schema before deploying
-- the API when DATABASE_SYNCHRONIZE=false. Never enable synchronize to repair drift.
-- Canonical Erflow read/update/refetch remains a rollout prerequisite.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tts_prepared_speech_enabled boolean DEFAULT NULL;
ALTER TABLE organization_agents ADD COLUMN IF NOT EXISTS tts_prepared_speech_enabled boolean DEFAULT NULL;
COMMIT;
