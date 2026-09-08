-- Phase 0 first-section foundation.
-- Additive only: existing project rows keep their current behavior and require no data backfill.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_location_area VARCHAR(255),
  ADD COLUMN IF NOT EXISTS scope_in TEXT,
  ADD COLUMN IF NOT EXISTS scope_out TEXT,
  ADD COLUMN IF NOT EXISTS scope_boundaries TEXT,
  ADD COLUMN IF NOT EXISTS scope_notes TEXT,
  ADD COLUMN IF NOT EXISTS expected_outcomes TEXT,
  ADD COLUMN IF NOT EXISTS success_criteria TEXT,
  ADD COLUMN IF NOT EXISTS key_indicators TEXT,
  ADD COLUMN IF NOT EXISTS work_plan_details TEXT,
  ADD COLUMN IF NOT EXISTS key_activities TEXT;

-- Rollback:
-- ALTER TABLE projects
--   DROP COLUMN IF EXISTS key_activities,
--   DROP COLUMN IF EXISTS work_plan_details,
--   DROP COLUMN IF EXISTS key_indicators,
--   DROP COLUMN IF EXISTS success_criteria,
--   DROP COLUMN IF EXISTS expected_outcomes,
--   DROP COLUMN IF EXISTS scope_notes,
--   DROP COLUMN IF EXISTS scope_boundaries,
--   DROP COLUMN IF EXISTS scope_out,
--   DROP COLUMN IF EXISTS scope_in,
--   DROP COLUMN IF EXISTS project_location_area;
