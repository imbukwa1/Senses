BEGIN;

-- Store free-text scheduled activities without changing existing milestone links.
ALTER TABLE project_work_plan_entries
  ADD COLUMN IF NOT EXISTS activity VARCHAR(200) NULL;

COMMIT;

-- Rollback:
-- ALTER TABLE project_work_plan_entries DROP COLUMN IF EXISTS activity;
