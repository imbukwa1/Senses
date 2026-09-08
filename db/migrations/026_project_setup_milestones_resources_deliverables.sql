-- Phase 0 sections 6, 7, and 10 foundations.
-- Additive only: deliverables continue to use task_deliverables; milestones/resources
-- are authoritative project records, not Phase 0-only copies.

CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  target_date DATE NOT NULL,
  responsible_user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL DEFAULT 'Not Started',
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('Not Started', 'In Progress', 'Complete')),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS project_milestones_project_id_idx ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS project_milestones_responsible_user_id_idx ON project_milestones(responsible_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_project_milestones_updated_at'
      AND tgrelid = 'project_milestones'::regclass
  ) THEN
    CREATE TRIGGER set_project_milestones_updated_at
    BEFORE UPDATE ON project_milestones
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

ALTER TABLE task_deliverables
  ADD COLUMN IF NOT EXISTS owner_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS due_date DATE NULL,
  ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT NULL,
  ADD COLUMN IF NOT EXISTS approver_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS task_deliverables_owner_id_idx ON task_deliverables(owner_id);
CREATE INDEX IF NOT EXISTS task_deliverables_approver_id_idx ON task_deliverables(approver_id);

CREATE TABLE IF NOT EXISTS project_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (resource_type IN ('People', 'Equipment', 'Materials', 'Facilities', 'Technology', 'Other'))
);

CREATE INDEX IF NOT EXISTS project_resources_project_id_idx ON project_resources(project_id);
CREATE INDEX IF NOT EXISTS project_resources_type_idx ON project_resources(resource_type);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_project_resources_updated_at'
      AND tgrelid = 'project_resources'::regclass
  ) THEN
    CREATE TRIGGER set_project_resources_updated_at
    BEFORE UPDATE ON project_resources
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Rollback:
-- DROP TABLE IF EXISTS project_resources;
-- ALTER TABLE task_deliverables
--   DROP COLUMN IF EXISTS approver_id,
--   DROP COLUMN IF EXISTS acceptance_criteria,
--   DROP COLUMN IF EXISTS due_date,
--   DROP COLUMN IF EXISTS owner_id;
-- DROP TABLE IF EXISTS project_milestones;
