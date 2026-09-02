BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'phase_status') THEN
    CREATE TYPE phase_status AS ENUM (
      'Not Started',
      'In Progress',
      'Completed'
    );
  END IF;
END;
$$;

CREATE TABLE phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  owner_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  start_date DATE NULL,
  end_date DATE NULL,
  status phase_status NOT NULL DEFAULT 'Not Started',
  display_order INTEGER NOT NULL,
  objectives TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ NULL,
  CHECK (display_order > 0),
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT phases_project_display_order_key UNIQUE (project_id, display_order) DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT phases_project_id_id_key UNIQUE (project_id, id)
);

ALTER TABLE projects
ADD CONSTRAINT projects_current_phase_fkey
FOREIGN KEY (id, current_phase_id)
REFERENCES phases(project_id, id)
ON DELETE RESTRICT;

CREATE INDEX phases_owner_id_idx ON phases(owner_id);
CREATE INDEX phases_status_idx ON phases(status);

CREATE TRIGGER set_phases_updated_at
BEFORE UPDATE ON phases
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
