BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_status') THEN
    CREATE TYPE project_status AS ENUM (
      'Planning',
      'Not Started',
      'Active',
      'On Hold',
      'Completed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'priority_level') THEN
    CREATE TYPE priority_level AS ENUM (
      'Low',
      'Medium',
      'High'
    );
  END IF;
END;
$$;

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  project_lead_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  current_phase_id UUID NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status project_status NOT NULL,
  funder_partner VARCHAR(255) NULL,
  project_type VARCHAR(100) NULL,
  objectives TEXT NULL,
  priority priority_level NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ NULL,
  CHECK (end_date >= start_date),
  CHECK (code ~ '^PRJ-[0-9]{4}-[0-9]{3}$')
);

CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE OR REPLACE FUNCTION set_project_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  project_year TEXT;
  next_number INTEGER;
BEGIN
  project_year := TO_CHAR(NEW.created_at, 'YYYY');

  PERFORM pg_advisory_xact_lock(hashtext('project_code_' || project_year));

  SELECT COALESCE(MAX(SUBSTRING(code FROM 10 FOR 3)::INTEGER), 0) + 1
  INTO next_number
  FROM projects
  WHERE code LIKE 'PRJ-' || project_year || '-___';

  IF next_number > 999 THEN
    RAISE EXCEPTION 'Project code limit reached for year %', project_year;
  END IF;

  NEW.code := 'PRJ-' || project_year || '-' || LPAD(next_number::TEXT, 3, '0');

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION preserve_project_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.code := OLD.code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_projects_code
BEFORE INSERT ON projects
FOR EACH ROW
EXECUTE FUNCTION set_project_code();

CREATE TRIGGER preserve_projects_code
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION preserve_project_code();

CREATE TRIGGER set_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
