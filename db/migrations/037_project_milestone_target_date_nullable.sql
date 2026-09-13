-- Legacy target_date is optional for the activity-style milestone records.
-- The column and all existing values are preserved for older API consumers.
ALTER TABLE project_milestones
  ALTER COLUMN target_date DROP NOT NULL;

-- Rollback:
-- ALTER TABLE project_milestones
--   ALTER COLUMN target_date SET NOT NULL;
