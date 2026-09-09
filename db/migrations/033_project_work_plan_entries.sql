BEGIN;

-- Additive schedule entries for Phase 0 Work Plan. Existing project-level
-- Work Plan fields remain authoritative for the original single-entry flow.
CREATE TABLE project_work_plan_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  details TEXT NOT NULL,
  key_activities TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(name)) > 0),
  CHECK (end_date >= start_date),
  CONSTRAINT project_work_plan_entries_phase_project_fkey
    FOREIGN KEY (project_id, phase_id)
    REFERENCES phases(project_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX project_work_plan_entries_project_id_idx
ON project_work_plan_entries(project_id);

CREATE INDEX project_work_plan_entries_phase_id_idx
ON project_work_plan_entries(phase_id);

CREATE TRIGGER set_project_work_plan_entries_updated_at
BEFORE UPDATE ON project_work_plan_entries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;

-- Rollback:
-- DROP TABLE IF EXISTS project_work_plan_entries;
