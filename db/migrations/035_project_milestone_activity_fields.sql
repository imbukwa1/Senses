-- Extend the existing project milestone records for setup activity planning.
-- Existing columns and rows remain valid; legacy target_date/responsible_user_id
-- are retained for compatibility with existing API consumers.
ALTER TABLE project_milestones
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS timeframe TEXT NULL,
  ADD COLUMN IF NOT EXISTS actual_date DATE NULL,
  ADD COLUMN IF NOT EXISTS responsible TEXT NULL,
  ADD COLUMN IF NOT EXISTS deliverable TEXT NULL;

-- Rollback:
-- ALTER TABLE project_milestones
--   DROP COLUMN IF EXISTS deliverable,
--   DROP COLUMN IF EXISTS responsible,
--   DROP COLUMN IF EXISTS actual_date,
--   DROP COLUMN IF EXISTS timeframe,
--   DROP COLUMN IF EXISTS description;
