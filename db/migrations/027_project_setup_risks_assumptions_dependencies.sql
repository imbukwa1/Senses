-- Phase 0 sections 12, 13, and 14.
-- Additive live project planning records; not Phase 0-only copies.

CREATE TABLE IF NOT EXISTS project_risks_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL,
  title VARCHAR(300) NOT NULL,
  likelihood VARCHAR(20) NOT NULL,
  impact VARCHAR(20) NOT NULL,
  mitigation TEXT NULL,
  owner_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'Open',
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (item_type IN ('Risk', 'Issue')),
  CHECK (likelihood IN ('Low', 'Medium', 'High')),
  CHECK (impact IN ('Low', 'Medium', 'High')),
  CHECK (status IN ('Open', 'In Progress', 'Mitigated', 'Closed'))
);

CREATE INDEX IF NOT EXISTS project_risks_issues_project_id_idx ON project_risks_issues(project_id);
CREATE INDEX IF NOT EXISTS project_risks_issues_owner_id_idx ON project_risks_issues(owner_id);
CREATE INDEX IF NOT EXISTS project_risks_issues_status_idx ON project_risks_issues(status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_risks_issues_updated_at'
      AND tgrelid = 'project_risks_issues'::regclass
  ) THEN
    CREATE TRIGGER set_project_risks_issues_updated_at
    BEFORE UPDATE ON project_risks_issues
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS project_assumptions_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_type VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  impact_notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (entry_type IN ('Assumption', 'Constraint'))
);

CREATE INDEX IF NOT EXISTS project_assumptions_constraints_project_id_idx ON project_assumptions_constraints(project_id);
CREATE INDEX IF NOT EXISTS project_assumptions_constraints_entry_type_idx ON project_assumptions_constraints(entry_type);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_assumptions_constraints_updated_at'
      AND tgrelid = 'project_assumptions_constraints'::regclass
  ) THEN
    CREATE TRIGGER set_project_assumptions_constraints_updated_at
    BEFORE UPDATE ON project_assumptions_constraints
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS project_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  dependency_type VARCHAR(20) NOT NULL,
  related_phase_id UUID NULL REFERENCES phases(id) ON DELETE SET NULL,
  related_task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
  responsible_user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  responsible_party VARCHAR(255) NULL,
  required_by_date DATE NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (dependency_type IN ('Internal', 'External'))
);

CREATE INDEX IF NOT EXISTS project_dependencies_project_id_idx ON project_dependencies(project_id);
CREATE INDEX IF NOT EXISTS project_dependencies_related_phase_id_idx ON project_dependencies(related_phase_id);
CREATE INDEX IF NOT EXISTS project_dependencies_related_task_id_idx ON project_dependencies(related_task_id);
CREATE INDEX IF NOT EXISTS project_dependencies_responsible_user_id_idx ON project_dependencies(responsible_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_dependencies_updated_at'
      AND tgrelid = 'project_dependencies'::regclass
  ) THEN
    CREATE TRIGGER set_project_dependencies_updated_at
    BEFORE UPDATE ON project_dependencies
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Rollback:
-- DROP TABLE IF EXISTS project_dependencies;
-- DROP TABLE IF EXISTS project_assumptions_constraints;
-- DROP TABLE IF EXISTS project_risks_issues;
