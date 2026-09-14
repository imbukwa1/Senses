BEGIN;

ALTER TABLE project_milestones
  ADD COLUMN phase_id UUID NULL;

ALTER TABLE project_milestones
  ADD CONSTRAINT project_milestones_phase_project_fkey
  FOREIGN KEY (project_id, phase_id)
  REFERENCES phases(project_id, id)
  ON DELETE SET NULL;

CREATE INDEX project_milestones_phase_id_idx
ON project_milestones(phase_id);

COMMIT;

-- Rollback:
-- DROP INDEX IF EXISTS project_milestones_phase_id_idx;
-- ALTER TABLE project_milestones DROP CONSTRAINT IF EXISTS project_milestones_phase_project_fkey;
-- ALTER TABLE project_milestones DROP COLUMN IF EXISTS phase_id;
