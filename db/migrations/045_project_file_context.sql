BEGIN;

-- Keep task-file compatibility while allowing project- and phase-level documents.
ALTER TABLE task_files
  ADD COLUMN IF NOT EXISTS project_id UUID NULL,
  ADD COLUMN IF NOT EXISTS phase_id UUID NULL;

UPDATE task_files
SET project_id = projects.id,
    phase_id = phases.id
FROM tasks
JOIN phases ON phases.id = tasks.phase_id
JOIN projects ON projects.id = phases.project_id
WHERE task_files.task_id = tasks.id
  AND (task_files.project_id IS NULL OR task_files.phase_id IS NULL);

ALTER TABLE task_files
  ADD CONSTRAINT task_files_project_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  ADD CONSTRAINT task_files_phase_project_fkey
    FOREIGN KEY (project_id, phase_id) REFERENCES phases(project_id, id) ON DELETE RESTRICT;

ALTER TABLE task_files
  ALTER COLUMN task_id DROP NOT NULL;

CREATE INDEX task_files_project_id_idx ON task_files(project_id);
CREATE INDEX task_files_phase_id_idx ON task_files(phase_id);

COMMIT;

-- Rollback:
-- ALTER TABLE task_files ALTER COLUMN task_id SET NOT NULL;
-- DROP INDEX IF EXISTS task_files_phase_id_idx;
-- DROP INDEX IF EXISTS task_files_project_id_idx;
-- ALTER TABLE task_files DROP CONSTRAINT IF EXISTS task_files_phase_project_fkey;
-- ALTER TABLE task_files DROP CONSTRAINT IF EXISTS task_files_project_fkey;
-- ALTER TABLE task_files DROP COLUMN IF EXISTS phase_id, DROP COLUMN IF EXISTS project_id;
