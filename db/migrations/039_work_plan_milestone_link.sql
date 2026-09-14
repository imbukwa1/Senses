BEGIN;

-- Link scheduled Work Plan entries to the existing Project Setup milestone/activity
-- without copying milestone fields into the Work Plan table.
ALTER TABLE project_work_plan_entries
  ADD COLUMN milestone_id UUID NULL;

ALTER TABLE project_work_plan_entries
  ADD CONSTRAINT project_work_plan_entries_milestone_project_fkey
  FOREIGN KEY (project_id, milestone_id)
  REFERENCES project_milestones(project_id, id)
  ON DELETE RESTRICT;

CREATE INDEX project_work_plan_entries_milestone_id_idx
ON project_work_plan_entries(milestone_id);

COMMIT;

-- Rollback:
-- ALTER TABLE project_work_plan_entries DROP CONSTRAINT IF EXISTS project_work_plan_entries_milestone_project_fkey;
-- DROP INDEX IF EXISTS project_work_plan_entries_milestone_id_idx;
-- ALTER TABLE project_work_plan_entries DROP COLUMN IF EXISTS milestone_id;
