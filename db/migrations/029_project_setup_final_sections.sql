-- Phase 0 sections 16, 18, 19, 20, and 21.
-- Additive live project planning records; not Phase 0-only copies.

ALTER TABLE task_files
ADD COLUMN IF NOT EXISTS setup_document_type VARCHAR(80) NULL;

CREATE INDEX IF NOT EXISTS task_files_setup_document_type_idx ON task_files(setup_document_type);

CREATE TABLE IF NOT EXISTS project_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  required_approval TEXT NOT NULL,
  approver_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  due_date DATE NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Required',
  approval_document_file_id UUID NULL REFERENCES task_files(id) ON DELETE SET NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('Required', 'Pending', 'Approved', 'Rejected', 'Not Required'))
);

CREATE INDEX IF NOT EXISTS project_approvals_project_id_idx ON project_approvals(project_id);
CREATE INDEX IF NOT EXISTS project_approvals_approver_id_idx ON project_approvals(approver_id);
CREATE INDEX IF NOT EXISTS project_approvals_approval_document_file_id_idx ON project_approvals(approval_document_file_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_approvals_updated_at'
      AND tgrelid = 'project_approvals'::regclass
  ) THEN
    CREATE TRIGGER set_project_approvals_updated_at
    BEFORE UPDATE ON project_approvals
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS project_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  change_description TEXT NOT NULL,
  reason TEXT NOT NULL,
  approved_by_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_date DATE NULL,
  notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_changes_project_id_idx ON project_changes(project_id);
CREATE INDEX IF NOT EXISTS project_changes_approved_by_id_idx ON project_changes(approved_by_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_changes_updated_at'
      AND tgrelid = 'project_changes'::regclass
  ) THEN
    CREATE TRIGGER set_project_changes_updated_at
    BEFORE UPDATE ON project_changes
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS project_specific_information (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label VARCHAR(200) NOT NULL,
  value TEXT NOT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_specific_information_project_id_idx ON project_specific_information(project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_specific_information_updated_at'
      AND tgrelid = 'project_specific_information'::regclass
  ) THEN
    CREATE TRIGGER set_project_specific_information_updated_at
    BEFORE UPDATE ON project_specific_information
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS project_setup_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_setup_notes_project_id_idx ON project_setup_notes(project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_setup_notes_updated_at'
      AND tgrelid = 'project_setup_notes'::regclass
  ) THEN
    CREATE TRIGGER set_project_setup_notes_updated_at
    BEFORE UPDATE ON project_setup_notes
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Rollback:
-- DROP TABLE IF EXISTS project_setup_notes;
-- DROP TABLE IF EXISTS project_specific_information;
-- DROP TABLE IF EXISTS project_changes;
-- DROP TABLE IF EXISTS project_approvals;
-- DROP INDEX IF EXISTS task_files_setup_document_type_idx;
-- ALTER TABLE task_files DROP COLUMN IF EXISTS setup_document_type;
