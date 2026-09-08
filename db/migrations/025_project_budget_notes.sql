-- Phase 0 budget setup notes.
-- Additive only: budget amounts continue to use existing projects/phases budget fields.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS budget_notes TEXT;

-- Rollback:
-- ALTER TABLE projects
--   DROP COLUMN IF EXISTS budget_notes;
