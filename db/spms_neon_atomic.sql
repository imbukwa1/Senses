-- Migration: 001_section_1_users.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 002_section_2_projects.sql

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

-- Migration: 003_section_3_project_health.sql

CREATE OR REPLACE FUNCTION calculate_project_health(
  project_status_value project_status,
  project_start_date DATE,
  project_end_date DATE,
  as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  health VARCHAR(20),
  health_color VARCHAR(20)
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN project_status_value = 'Completed' THEN 'Completed'
      WHEN as_of_date > project_end_date THEN 'Delayed'
      WHEN project_end_date - as_of_date <= 7 THEN 'At Risk'
      ELSE 'Active'
    END::VARCHAR(20) AS health,
    CASE
      WHEN project_status_value = 'Completed' THEN 'Green'
      WHEN as_of_date > project_end_date THEN 'Red'
      WHEN project_end_date - as_of_date <= 7 THEN 'Amber'
      ELSE 'Purple'
    END::VARCHAR(20) AS health_color;
$$;

CREATE VIEW project_health AS
SELECT
  projects.*,
  calculated_health.health,
  calculated_health.health_color
FROM projects
CROSS JOIN LATERAL calculate_project_health(
  projects.status,
  projects.start_date,
  projects.end_date
) AS calculated_health;

-- Migration: 004_section_4_project_dashboard_progress.sql

CREATE OR REPLACE FUNCTION calculate_task_progress(
  task_status_value TEXT,
  completed_checklist_items INTEGER DEFAULT NULL,
  total_checklist_items INTEGER DEFAULT NULL
)
RETURNS NUMERIC(5,2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN total_checklist_items IS NOT NULL AND total_checklist_items > 0 THEN
        ROUND((COALESCE(completed_checklist_items, 0)::NUMERIC / total_checklist_items::NUMERIC) * 100, 2)
      WHEN task_status_value = 'Completed' THEN
        100.00
      WHEN task_status_value = 'In Progress' THEN
        50.00
      WHEN task_status_value = 'Not Started' THEN
        0.00
      WHEN task_status_value = 'Blocked' THEN
        0.00
      ELSE
        0.00
    END::NUMERIC(5,2);
$$;

CREATE OR REPLACE FUNCTION calculate_average_progress(
  progress_values NUMERIC[]
)
RETURNS NUMERIC(5,2)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (
      SELECT ROUND(AVG(progress_value), 2)
      FROM UNNEST(progress_values) AS progress_value
    ),
    0.00
  )::NUMERIC(5,2);
$$;

CREATE VIEW project_dashboard AS
SELECT
  projects.id,
  projects.code,
  projects.name AS project_name,
  projects.description,
  users.id AS project_lead_id,
  users.name AS project_lead_name,
  users.email AS project_lead_email,
  projects.status,
  project_health.health,
  project_health.health_color,
  0.00::NUMERIC(5,2) AS overall_progress,
  projects.current_phase_id,
  projects.start_date,
  projects.end_date,
  projects.priority,
  projects.archived_at,
  projects.created_at,
  projects.updated_at
FROM projects
JOIN users ON users.id = projects.project_lead_id
JOIN project_health ON project_health.id = projects.id;

-- Migration: 005_section_5_phases.sql

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

-- Migration: 006_section_6_tasks.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM (
      'Not Started',
      'In Progress',
      'Blocked',
      'Completed'
    );
  END IF;
END;
$$;

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES phases(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  priority priority_level NOT NULL DEFAULT 'Medium',
  status task_status NOT NULL DEFAULT 'Not Started',
  start_date DATE NULL,
  due_date DATE NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_date IS NULL OR due_date IS NULL OR due_date >= start_date)
);

CREATE TABLE task_supporters (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'Completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status <> 'Completed' THEN
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE INDEX tasks_phase_id_idx ON tasks(phase_id);
CREATE INDEX tasks_owner_id_idx ON tasks(owner_id);
CREATE INDEX tasks_status_idx ON tasks(status);
CREATE INDEX tasks_due_date_idx ON tasks(due_date);
CREATE INDEX task_supporters_user_id_idx ON task_supporters(user_id);

CREATE TRIGGER set_tasks_completed_at
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_task_completed_at();

CREATE TRIGGER set_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 007_section_7_task_deliverables.sql

CREATE TABLE task_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (display_order > 0),
  CONSTRAINT task_deliverables_task_display_order_key UNIQUE (task_id, display_order) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE OR REPLACE FUNCTION set_task_deliverable_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_completed THEN
    IF TG_OP = 'INSERT'
      OR OLD.is_completed IS DISTINCT FROM NEW.is_completed
      OR OLD.completed_at IS DISTINCT FROM NEW.completed_at THEN
      NEW.completed_at = NOW();
    END IF;
  ELSE
    NEW.completed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_task_progress(
  selected_task_id UUID
)
RETURNS NUMERIC(5,2)
LANGUAGE sql
STABLE
AS $$
  SELECT calculate_task_progress(
    tasks.status::TEXT,
    COUNT(task_deliverables.id) FILTER (WHERE task_deliverables.is_completed)::INTEGER,
    COUNT(task_deliverables.id)::INTEGER
  )
  FROM tasks
  LEFT JOIN task_deliverables ON task_deliverables.task_id = tasks.id
  WHERE tasks.id = selected_task_id
  GROUP BY tasks.id, tasks.status;
$$;

CREATE VIEW task_deliverable_counts AS
SELECT
  tasks.id AS task_id,
  COUNT(task_deliverables.id)::INTEGER AS total_items,
  COUNT(task_deliverables.id) FILTER (WHERE task_deliverables.is_completed)::INTEGER AS completed_items
FROM tasks
LEFT JOIN task_deliverables ON task_deliverables.task_id = tasks.id
GROUP BY tasks.id;

CREATE VIEW task_progress AS
SELECT
  tasks.id AS task_id,
  calculate_task_progress(tasks.id) AS progress
FROM tasks;

CREATE TRIGGER set_task_deliverables_completed_at
BEFORE INSERT OR UPDATE ON task_deliverables
FOR EACH ROW
EXECUTE FUNCTION set_task_deliverable_completed_at();

CREATE TRIGGER set_task_deliverables_updated_at
BEFORE UPDATE ON task_deliverables
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 008_section_8_task_comments_files.sql

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(comment)) > 0)
);

CREATE TABLE task_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name VARCHAR(255) NOT NULL,
  storage_key TEXT NOT NULL,
  file_type VARCHAR(255) NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(file_name)) > 0),
  CHECK (LENGTH(BTRIM(storage_key)) > 0),
  CHECK (file_size >= 0),
  CONSTRAINT task_files_storage_key_key UNIQUE (storage_key)
);

CREATE INDEX comments_task_id_idx ON comments(task_id);
CREATE INDEX comments_user_id_idx ON comments(user_id);
CREATE INDEX comments_created_at_idx ON comments(created_at);

CREATE INDEX task_files_task_id_idx ON task_files(task_id);
CREATE INDEX task_files_uploaded_by_idx ON task_files(uploaded_by);
CREATE INDEX task_files_created_at_idx ON task_files(created_at);

CREATE TRIGGER set_comments_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 009_section_9_search.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX projects_code_search_idx
ON projects
USING GIN (code gin_trgm_ops);

CREATE INDEX projects_name_search_idx
ON projects
USING GIN (name gin_trgm_ops);

CREATE INDEX projects_description_search_idx
ON projects
USING GIN (description gin_trgm_ops);

CREATE INDEX projects_objectives_search_idx
ON projects
USING GIN (objectives gin_trgm_ops);

CREATE INDEX phases_name_search_idx
ON phases
USING GIN (name gin_trgm_ops);

CREATE INDEX phases_description_search_idx
ON phases
USING GIN (description gin_trgm_ops);

CREATE INDEX phases_objectives_search_idx
ON phases
USING GIN (objectives gin_trgm_ops);

CREATE INDEX tasks_name_search_idx
ON tasks
USING GIN (name gin_trgm_ops);

CREATE INDEX tasks_description_search_idx
ON tasks
USING GIN (description gin_trgm_ops);

CREATE OR REPLACE FUNCTION search_project_phase_task_records(
  search_query TEXT
)
RETURNS TABLE (
  result_type VARCHAR(20),
  project_id UUID,
  project_code VARCHAR(30),
  project_name VARCHAR(200),
  phase_id UUID,
  phase_name VARCHAR(200),
  task_id UUID,
  task_name VARCHAR(200),
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  WITH normalized_search AS (
    SELECT
      '%' || NULLIF(BTRIM(search_query), '') || '%' AS pattern
  )
  SELECT
    'project'::VARCHAR(20) AS result_type,
    projects.id AS project_id,
    projects.code AS project_code,
    projects.name AS project_name,
    NULL::UUID AS phase_id,
    NULL::VARCHAR(200) AS phase_name,
    NULL::UUID AS task_id,
    NULL::VARCHAR(200) AS task_name,
    projects.status::TEXT AS status,
    projects.created_at,
    projects.updated_at
  FROM projects
  CROSS JOIN normalized_search
  WHERE normalized_search.pattern IS NOT NULL
    AND projects.archived_at IS NULL
    AND (
      projects.code ILIKE normalized_search.pattern
      OR projects.name ILIKE normalized_search.pattern
      OR projects.description ILIKE normalized_search.pattern
      OR projects.funder_partner ILIKE normalized_search.pattern
      OR projects.project_type ILIKE normalized_search.pattern
      OR projects.objectives ILIKE normalized_search.pattern
    )

  UNION ALL

  SELECT
    'phase'::VARCHAR(20) AS result_type,
    projects.id AS project_id,
    projects.code AS project_code,
    projects.name AS project_name,
    phases.id AS phase_id,
    phases.name AS phase_name,
    NULL::UUID AS task_id,
    NULL::VARCHAR(200) AS task_name,
    phases.status::TEXT AS status,
    phases.created_at,
    phases.updated_at
  FROM phases
  JOIN projects ON projects.id = phases.project_id
  CROSS JOIN normalized_search
  WHERE normalized_search.pattern IS NOT NULL
    AND projects.archived_at IS NULL
    AND phases.archived_at IS NULL
    AND (
      phases.name ILIKE normalized_search.pattern
      OR phases.description ILIKE normalized_search.pattern
      OR phases.objectives ILIKE normalized_search.pattern
    )

  UNION ALL

  SELECT
    'task'::VARCHAR(20) AS result_type,
    projects.id AS project_id,
    projects.code AS project_code,
    projects.name AS project_name,
    phases.id AS phase_id,
    phases.name AS phase_name,
    tasks.id AS task_id,
    tasks.name AS task_name,
    tasks.status::TEXT AS status,
    tasks.created_at,
    tasks.updated_at
  FROM tasks
  JOIN phases ON phases.id = tasks.phase_id
  JOIN projects ON projects.id = phases.project_id
  CROSS JOIN normalized_search
  WHERE normalized_search.pattern IS NOT NULL
    AND projects.archived_at IS NULL
    AND phases.archived_at IS NULL
    AND (
      tasks.name ILIKE normalized_search.pattern
      OR tasks.description ILIKE normalized_search.pattern
    )
  ORDER BY result_type, created_at DESC;
$$;

-- Migration: 010_section_10_audit_logs.sql

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,
  old_values JSONB NULL,
  new_values JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(entity_type)) > 0),
  CHECK (action IN ('CREATE', 'UPDATE')),
  CHECK (
    (action = 'CREATE' AND old_values IS NULL AND new_values IS NOT NULL)
    OR (action = 'UPDATE' AND old_values IS NOT NULL AND new_values IS NOT NULL)
  )
);

CREATE INDEX audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);

CREATE OR REPLACE FUNCTION current_audit_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
$$;

CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  audited_entity_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    audited_entity_id := (to_jsonb(NEW)->>'id')::UUID;

    INSERT INTO audit_logs (
      user_id,
      entity_type,
      entity_id,
      action,
      old_values,
      new_values
    )
    VALUES (
      current_audit_user_id(),
      TG_TABLE_NAME,
      audited_entity_id,
      'CREATE',
      NULL,
      to_jsonb(NEW)
    );

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    audited_entity_id := (to_jsonb(NEW)->>'id')::UUID;

    INSERT INTO audit_logs (
      user_id,
      entity_type,
      entity_id,
      action,
      old_values,
      new_values
    )
    VALUES (
      current_audit_user_id(),
      TG_TABLE_NAME,
      audited_entity_id,
      'UPDATE',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

CREATE TRIGGER prevent_audit_logs_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_changes();

CREATE TRIGGER prevent_audit_logs_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_changes();

CREATE TRIGGER audit_users_changes
AFTER INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_projects_changes
AFTER INSERT OR UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_phases_changes
AFTER INSERT OR UPDATE ON phases
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_tasks_changes
AFTER INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_task_deliverables_changes
AFTER INSERT OR UPDATE ON task_deliverables
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_comments_changes
AFTER INSERT OR UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_task_files_changes
AFTER INSERT OR UPDATE ON task_files
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

-- Migration: 011_backend_section_3_auth_credentials.sql

CREATE TABLE user_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(password_hash)) > 0)
);

CREATE TRIGGER set_user_credentials_updated_at
BEFORE UPDATE ON user_credentials
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 012_project_member_roles.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_member_role') THEN
    CREATE TYPE project_member_role AS ENUM (
      'PM',
      'Team Member',
      'Finance'
    );
  END IF;
END;
$$;

ALTER TABLE project_members
ADD COLUMN IF NOT EXISTS role project_member_role;

UPDATE project_members
SET role = 'Team Member'
WHERE role IS NULL;

UPDATE project_members
SET role = 'PM'
FROM projects
WHERE projects.id = project_members.project_id
  AND projects.project_lead_id = project_members.user_id;

INSERT INTO project_members (project_id, user_id, role)
SELECT projects.id, projects.project_lead_id, 'PM'
FROM projects
ON CONFLICT (project_id, user_id)
DO UPDATE SET role = 'PM'
WHERE project_members.role <> 'PM';

ALTER TABLE project_members
ALTER COLUMN role SET DEFAULT 'Team Member';

ALTER TABLE project_members
ALTER COLUMN role SET NOT NULL;

CREATE INDEX IF NOT EXISTS project_members_project_role_idx
ON project_members(project_id, role);

-- Migration: 013_phase_members.sql

CREATE TABLE phase_members (
  phase_id UUID NOT NULL REFERENCES phases(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phase_id, user_id)
);

CREATE INDEX phase_members_phase_id_idx ON phase_members(phase_id);
CREATE INDEX phase_members_user_id_idx ON phase_members(user_id);

CREATE OR REPLACE FUNCTION ensure_phase_member_is_project_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM phases
    JOIN project_members
      ON project_members.project_id = phases.project_id
     AND project_members.user_id = NEW.user_id
    WHERE phases.id = NEW.phase_id
      AND phases.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase member must belong to the parent project'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_phase_member_parent_project_membership
BEFORE INSERT OR UPDATE ON phase_members
FOR EACH ROW
EXECUTE FUNCTION ensure_phase_member_is_project_member();

CREATE OR REPLACE FUNCTION prevent_project_member_removal_with_phase_memberships()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM phase_members
    JOIN phases
      ON phases.id = phase_members.phase_id
    WHERE phases.project_id = OLD.project_id
      AND phase_members.user_id = OLD.user_id
  ) THEN
    RAISE EXCEPTION 'Project member still belongs to project phases'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER prevent_project_member_removal_with_phase_memberships
BEFORE DELETE ON project_members
FOR EACH ROW
EXECUTE FUNCTION prevent_project_member_removal_with_phase_memberships();

-- Migration: 014_project_budget.sql

ALTER TABLE projects
ADD COLUMN budget_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
ADD COLUMN budget_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
ADD CONSTRAINT projects_budget_allocated_non_negative CHECK (budget_allocated >= 0),
ADD CONSTRAINT projects_budget_spent_non_negative CHECK (budget_spent >= 0);

-- Migration: 015_task_file_category.sql

ALTER TABLE task_files
ADD COLUMN file_category VARCHAR(32) NOT NULL DEFAULT 'reference',
ADD CONSTRAINT task_files_file_category_check
  CHECK (file_category IN ('reference', 'work_submission'));

-- Migration: 016_membership_audit_compatibility.sql

ALTER TABLE audit_logs
DROP CONSTRAINT IF EXISTS audit_logs_action_check,
DROP CONSTRAINT IF EXISTS audit_logs_check,
DROP CONSTRAINT IF EXISTS audit_logs_values_check;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_action_check CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
ADD CONSTRAINT audit_logs_values_check CHECK (
  (action = 'CREATE' AND old_values IS NULL AND new_values IS NOT NULL)
  OR (action = 'UPDATE' AND old_values IS NOT NULL AND new_values IS NOT NULL)
  OR (action = 'DELETE' AND old_values IS NOT NULL AND new_values IS NULL)
);

CREATE OR REPLACE FUNCTION deterministic_audit_uuid(value TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    SUBSTRING(md5(value) FROM 1 FOR 8) || '-' ||
    SUBSTRING(md5(value) FROM 9 FOR 4) || '-' ||
    SUBSTRING(md5(value) FROM 13 FOR 4) || '-' ||
    SUBSTRING(md5(value) FROM 17 FOR 4) || '-' ||
    SUBSTRING(md5(value) FROM 21 FOR 12)
  )::UUID;
$$;

CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  audited_entity_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    audited_entity_id := (to_jsonb(NEW)->>'id')::UUID;

    INSERT INTO audit_logs (
      user_id,
      entity_type,
      entity_id,
      action,
      old_values,
      new_values
    )
    VALUES (
      current_audit_user_id(),
      TG_TABLE_NAME,
      audited_entity_id,
      'CREATE',
      NULL,
      to_jsonb(NEW)
    );

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    audited_entity_id := (to_jsonb(NEW)->>'id')::UUID;

    INSERT INTO audit_logs (
      user_id,
      entity_type,
      entity_id,
      action,
      old_values,
      new_values
    )
    VALUES (
      current_audit_user_id(),
      TG_TABLE_NAME,
      audited_entity_id,
      'UPDATE',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    audited_entity_id := (to_jsonb(OLD)->>'id')::UUID;

    INSERT INTO audit_logs (
      user_id,
      entity_type,
      entity_id,
      action,
      old_values,
      new_values
    )
    VALUES (
      current_audit_user_id(),
      TG_TABLE_NAME,
      audited_entity_id,
      'DELETE',
      to_jsonb(OLD),
      NULL
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION write_membership_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  record_values JSONB;
  audited_entity_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    record_values := to_jsonb(OLD);
  ELSE
    record_values := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'project_members' THEN
    audited_entity_id := deterministic_audit_uuid((record_values->>'project_id') || ':' || (record_values->>'user_id'));
  ELSIF TG_TABLE_NAME = 'phase_members' THEN
    audited_entity_id := deterministic_audit_uuid((record_values->>'phase_id') || ':' || (record_values->>'user_id'));
  ELSIF TG_TABLE_NAME = 'task_supporters' THEN
    audited_entity_id := deterministic_audit_uuid((record_values->>'task_id') || ':' || (record_values->>'user_id'));
  ELSE
    RAISE EXCEPTION 'Unsupported membership audit table: %', TG_TABLE_NAME;
  END IF;

  INSERT INTO audit_logs (
    user_id,
    entity_type,
    entity_id,
    action,
    old_values,
    new_values
  )
  VALUES (
    current_audit_user_id(),
    TG_TABLE_NAME,
    audited_entity_id,
    CASE TG_OP
      WHEN 'INSERT' THEN 'CREATE'
      WHEN 'UPDATE' THEN 'UPDATE'
      ELSE 'DELETE'
    END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_project_members_changes ON project_members;
CREATE TRIGGER audit_project_members_changes
AFTER INSERT OR UPDATE OR DELETE ON project_members
FOR EACH ROW
EXECUTE FUNCTION write_membership_audit_log();

DROP TRIGGER IF EXISTS audit_phase_members_changes ON phase_members;
CREATE TRIGGER audit_phase_members_changes
AFTER INSERT OR UPDATE OR DELETE ON phase_members
FOR EACH ROW
EXECUTE FUNCTION write_membership_audit_log();

DROP TRIGGER IF EXISTS audit_task_supporters_changes ON task_supporters;
CREATE TRIGGER audit_task_supporters_changes
AFTER INSERT OR UPDATE OR DELETE ON task_supporters
FOR EACH ROW
EXECUTE FUNCTION write_membership_audit_log();

-- Migration: 017_task_file_finance_category.sql
ALTER TABLE task_files
DROP CONSTRAINT task_files_file_category_check,
ADD CONSTRAINT task_files_file_category_check
  CHECK (file_category IN ('reference', 'work_submission', 'finance'));


-- Migration: 018_phase_budgets.sql
ALTER TABLE phases
ADD COLUMN budget_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
ADD COLUMN budget_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
ADD CONSTRAINT phases_budget_allocated_non_negative CHECK (budget_allocated >= 0),
ADD CONSTRAINT phases_budget_spent_non_negative CHECK (budget_spent >= 0);


-- Migration: 019_workspace_folders.sql

CREATE TABLE workspace_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  parent_folder_id UUID NULL,
  name VARCHAR(200) NOT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(name)) > 0),
  CONSTRAINT workspace_folders_project_id_id_key UNIQUE (project_id, id),
  CONSTRAINT workspace_folders_parent_not_self_check CHECK (parent_folder_id IS NULL OR parent_folder_id <> id),
  CONSTRAINT workspace_folders_parent_same_project_fkey
    FOREIGN KEY (project_id, parent_folder_id)
    REFERENCES workspace_folders(project_id, id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX workspace_folders_project_id_idx ON workspace_folders(project_id);
CREATE INDEX workspace_folders_parent_folder_id_idx ON workspace_folders(parent_folder_id);
CREATE INDEX workspace_folders_created_by_idx ON workspace_folders(created_by);

CREATE TRIGGER set_workspace_folders_updated_at
BEFORE UPDATE ON workspace_folders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE task_files
ADD COLUMN folder_id UUID NULL REFERENCES workspace_folders(id) ON DELETE SET NULL;

CREATE INDEX task_files_folder_id_idx ON task_files(folder_id) WHERE folder_id IS NOT NULL;

CREATE OR REPLACE FUNCTION enforce_task_file_folder_project()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.folder_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM tasks
    JOIN phases ON phases.id = tasks.phase_id
    JOIN workspace_folders ON workspace_folders.id = NEW.folder_id
    WHERE workspace_folders.project_id = phases.project_id
      AND tasks.id = NEW.task_id
  ) THEN
    RAISE foreign_key_violation USING MESSAGE = 'task file folder must belong to the same project as the task';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_task_file_folder_project
BEFORE INSERT OR UPDATE OF task_id, folder_id ON task_files
FOR EACH ROW
EXECUTE FUNCTION enforce_task_file_folder_project();

-- Migration: 020_workspace_folder_name_uniqueness.sql

CREATE UNIQUE INDEX workspace_folders_project_parent_name_key
ON workspace_folders (
  project_id,
  COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::UUID),
  LOWER(BTRIM(name))
);

-- Migration: 021_native_workspace_resources.sql

CREATE TABLE workspace_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  folder_id UUID NULL REFERENCES workspace_folders(id) ON DELETE SET NULL,
  task_id UUID NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  content JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::JSONB,
  created_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(name)) > 0)
);

CREATE TABLE workspace_spreadsheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  folder_id UUID NULL REFERENCES workspace_folders(id) ON DELETE SET NULL,
  task_id UUID NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  content JSONB NOT NULL DEFAULT '{"id":"workbook","name":"Sheet","sheetOrder":[],"sheets":{}}'::JSONB,
  created_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(name)) > 0)
);

CREATE INDEX workspace_documents_project_id_idx ON workspace_documents(project_id);
CREATE INDEX workspace_documents_folder_id_idx ON workspace_documents(folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX workspace_documents_task_id_idx ON workspace_documents(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX workspace_documents_created_by_idx ON workspace_documents(created_by);

CREATE INDEX workspace_spreadsheets_project_id_idx ON workspace_spreadsheets(project_id);
CREATE INDEX workspace_spreadsheets_folder_id_idx ON workspace_spreadsheets(folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX workspace_spreadsheets_task_id_idx ON workspace_spreadsheets(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX workspace_spreadsheets_created_by_idx ON workspace_spreadsheets(created_by);

CREATE TRIGGER set_workspace_documents_updated_at
BEFORE UPDATE ON workspace_documents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_workspace_spreadsheets_updated_at
BEFORE UPDATE ON workspace_spreadsheets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION enforce_workspace_resource_project_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM workspace_folders
    WHERE workspace_folders.id = NEW.folder_id
      AND workspace_folders.project_id = NEW.project_id
  ) THEN
    RAISE foreign_key_violation USING MESSAGE = 'workspace resource folder must belong to the same project';
  END IF;

  IF NEW.task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM tasks
    JOIN phases ON phases.id = tasks.phase_id
    WHERE tasks.id = NEW.task_id
      AND phases.project_id = NEW.project_id
  ) THEN
    RAISE foreign_key_violation USING MESSAGE = 'workspace resource task must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_workspace_documents_task_project
BEFORE INSERT OR UPDATE OF project_id, folder_id, task_id ON workspace_documents
FOR EACH ROW
EXECUTE FUNCTION enforce_workspace_resource_project_links();

CREATE TRIGGER enforce_workspace_spreadsheets_task_project
BEFORE INSERT OR UPDATE OF project_id, folder_id, task_id ON workspace_spreadsheets
FOR EACH ROW
EXECUTE FUNCTION enforce_workspace_resource_project_links();

-- Migration: 022_workspace_collaboration_states.sql

CREATE TABLE workspace_collaboration_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(32) NOT NULL,
  resource_id UUID NOT NULL,
  yjs_state BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_collaboration_states_resource_type_check
    CHECK (resource_type IN ('document')),
  CONSTRAINT workspace_collaboration_states_resource_key
    UNIQUE (resource_type, resource_id),
  CONSTRAINT workspace_collaboration_states_document_fkey
    FOREIGN KEY (resource_id)
    REFERENCES workspace_documents(id)
    ON DELETE CASCADE
);

CREATE INDEX workspace_collaboration_states_resource_id_idx
ON workspace_collaboration_states(resource_id);

CREATE TRIGGER set_workspace_collaboration_states_updated_at
BEFORE UPDATE ON workspace_collaboration_states
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 023_project_setup_phase0.sql

CREATE TABLE project_setup_section_statuses (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  section_key VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL,
  updated_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, section_key),
  CONSTRAINT project_setup_section_statuses_status_check
    CHECK (status IN ('Complete', 'In Progress', 'Not Started', 'Not Applicable')),
  CONSTRAINT project_setup_section_statuses_section_key_check
    CHECK (LENGTH(BTRIM(section_key)) > 0)
);

CREATE INDEX project_setup_section_statuses_project_id_idx
ON project_setup_section_statuses(project_id);

CREATE INDEX project_setup_section_statuses_updated_by_idx
ON project_setup_section_statuses(updated_by);

CREATE TRIGGER set_project_setup_section_statuses_updated_at
BEFORE UPDATE ON project_setup_section_statuses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Migration: 024_project_setup_first_sections.sql
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


-- Migration: 025_project_budget_notes.sql
-- Phase 0 budget setup notes.
-- Additive only: budget amounts continue to use existing projects/phases budget fields.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS budget_notes TEXT;

-- Rollback:
-- ALTER TABLE projects
--   DROP COLUMN IF EXISTS budget_notes;


-- Migration: 026_project_setup_milestones_resources_deliverables.sql
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


-- Migration: 027_project_setup_risks_assumptions_dependencies.sql
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


-- Migration: 028_project_setup_stakeholders_communication_monitoring.sql
-- Phase 0 sections 9, 15, and 17.
-- Additive live project planning records; not Phase 0-only copies.

CREATE TABLE IF NOT EXISTS project_stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  organisation_group VARCHAR(255) NULL,
  interest_role TEXT NOT NULL,
  influence_importance VARCHAR(100) NULL,
  engagement_notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_stakeholders_project_id_idx ON project_stakeholders(project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_stakeholders_updated_at'
      AND tgrelid = 'project_stakeholders'::regclass
  ) THEN
    CREATE TRIGGER set_project_stakeholders_updated_at
    BEFORE UPDATE ON project_stakeholders
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS project_communication_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  information TEXT NOT NULL,
  frequency VARCHAR(100) NOT NULL,
  responsible_user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  method VARCHAR(150) NOT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_communication_plan_items_project_id_idx ON project_communication_plan_items(project_id);
CREATE INDEX IF NOT EXISTS project_communication_plan_items_responsible_user_id_idx ON project_communication_plan_items(responsible_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_communication_plan_items_updated_at'
      AND tgrelid = 'project_communication_plan_items'::regclass
  ) THEN
    CREATE TRIGGER set_project_communication_plan_items_updated_at
    BEFORE UPDATE ON project_communication_plan_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS project_monitoring_reporting_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  monitored_item TEXT NOT NULL,
  reporting_frequency VARCHAR(100) NOT NULL,
  responsible_user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  key_measures TEXT NULL,
  reporting_notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_monitoring_reporting_items_project_id_idx ON project_monitoring_reporting_items(project_id);
CREATE INDEX IF NOT EXISTS project_monitoring_reporting_items_responsible_user_id_idx ON project_monitoring_reporting_items(responsible_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_monitoring_reporting_items_updated_at'
      AND tgrelid = 'project_monitoring_reporting_items'::regclass
  ) THEN
    CREATE TRIGGER set_project_monitoring_reporting_items_updated_at
    BEFORE UPDATE ON project_monitoring_reporting_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Rollback:
-- DROP TABLE IF EXISTS project_monitoring_reporting_items;
-- DROP TABLE IF EXISTS project_communication_plan_items;
-- DROP TABLE IF EXISTS project_stakeholders;


-- Migration: 029_project_setup_final_sections.sql
-- Phase 0 sections 16, 18, 19, 20, and 21.
-- Additive live project planning records; not Phase 0-only copies.

ALTER TABLE task_files
ADD COLUMN IF NOT EXISTS setup_document_type VARCHAR(80) NULL;

CREATE INDEX IF NOT EXISTS task_files_setup_document_type_idx ON task_files(setup_document_type);

CREATE TABLE IF NOT EXISTS project_setup_document_categories (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Not Started',
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, category),
  CHECK (category IN ('Proposal', 'Contract / Agreement', 'Research Licence', 'Baseline', 'Inception', 'Middle Health', '1st Draft Project Document', 'Final Draft', 'Other Documents')),
  CHECK (status IN ('Not Started', 'In Progress', 'Complete', 'Not Applicable'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_setup_document_categories_updated_at'
      AND tgrelid = 'project_setup_document_categories'::regclass
  ) THEN
    CREATE TRIGGER set_project_setup_document_categories_updated_at
    BEFORE UPDATE ON project_setup_document_categories
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

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
-- DROP TABLE IF EXISTS project_setup_document_categories;
-- DROP TABLE IF EXISTS project_specific_information;
-- DROP TABLE IF EXISTS project_changes;
-- DROP TABLE IF EXISTS project_approvals;
-- DROP INDEX IF EXISTS task_files_setup_document_type_idx;
-- ALTER TABLE task_files DROP COLUMN IF EXISTS setup_document_type;


-- Migration: 030_comment_read_state.sql
-- Per-user task comment last-seen state. Comment rows remain unchanged.
CREATE TABLE IF NOT EXISTS comment_read_state (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  last_seen_comment_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS comment_read_state_task_idx ON comment_read_state(task_id);


-- Migration: 031_workspace_spreadsheet_univer_units.sql

ALTER TABLE workspace_spreadsheets
  ADD COLUMN univer_unit_id VARCHAR(255) NULL;

CREATE UNIQUE INDEX workspace_spreadsheets_univer_unit_id_idx
  ON workspace_spreadsheets(univer_unit_id)
  WHERE univer_unit_id IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS workspace_spreadsheets_univer_unit_id_idx;
-- ALTER TABLE workspace_spreadsheets DROP COLUMN IF EXISTS univer_unit_id;

-- Migration: 032_workspace_resource_revisions.sql

CREATE TABLE workspace_resource_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  resource_type VARCHAR(32) NOT NULL,
  resource_id UUID NOT NULL,
  snapshot JSONB NULL,
  yjs_state BYTEA NULL,
  label VARCHAR(200) NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_resource_revisions_type_check
    CHECK (resource_type IN ('document', 'spreadsheet')),
  CONSTRAINT workspace_resource_revisions_payload_check
    CHECK ((snapshot IS NULL) <> (yjs_state IS NULL))
);

CREATE INDEX workspace_resource_revisions_resource_idx
  ON workspace_resource_revisions(project_id, resource_type, resource_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION enforce_workspace_revision_project_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.resource_type = 'document' AND NOT EXISTS (
    SELECT 1 FROM workspace_documents
    WHERE id = NEW.resource_id AND project_id = NEW.project_id
  ) THEN
    RAISE foreign_key_violation USING MESSAGE = 'document revision resource must belong to the same project';
  END IF;

  IF NEW.resource_type = 'spreadsheet' AND NOT EXISTS (
    SELECT 1 FROM workspace_spreadsheets
    WHERE id = NEW.resource_id AND project_id = NEW.project_id
  ) THEN
    RAISE foreign_key_violation USING MESSAGE = 'spreadsheet revision resource must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_workspace_revision_project_link
BEFORE INSERT OR UPDATE OF project_id, resource_type, resource_id ON workspace_resource_revisions
FOR EACH ROW
EXECUTE FUNCTION enforce_workspace_revision_project_link();

-- Migration: 033_project_work_plan_entries.sql

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

-- Rollback:
-- DROP TABLE IF EXISTS project_work_plan_entries;


-- Migration: 034_comment_mentions.sql
-- Comments without mention rows remain general/legacy comments.
CREATE TABLE comment_mentions (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX comment_mentions_user_id_idx ON comment_mentions(user_id);


-- Migration: 035_project_milestone_activity_fields.sql
-- Extend the existing project milestone records for setup activity planning.
-- Existing columns and rows remain valid; legacy target_date/responsible_user_id
-- are retained for compatibility with existing API consumers.
ALTER TABLE project_milestones
  ADD COLUMN IF NOT EXISTS description TEXT NULL,
  ADD COLUMN IF NOT EXISTS timeframe TEXT NULL,
  ADD COLUMN IF NOT EXISTS actual_date DATE NULL,
  ADD COLUMN IF NOT EXISTS responsible TEXT NULL,
  ADD COLUMN IF NOT EXISTS deliverable TEXT NULL;

-- Rollback:
-- ALTER TABLE project_milestones
--   DROP COLUMN IF EXISTS deliverable,
--   DROP COLUMN IF EXISTS responsible,
--   DROP COLUMN IF EXISTS actual_date,
--   DROP COLUMN IF EXISTS timeframe,
--   DROP COLUMN IF EXISTS description;


-- Migration: 036_project_milestone_finance.sql
-- Finance tracking for the existing project milestone/activity records.
-- One finance row belongs to one milestone; milestone name/description remain
-- authoritative in project_milestones.
ALTER TABLE project_milestones
  ADD CONSTRAINT project_milestones_project_id_id_key UNIQUE (project_id, id);

CREATE TABLE project_milestone_finance (
  milestone_id UUID PRIMARY KEY REFERENCES project_milestones(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  month VARCHAR(50) NULL,
  allocated NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allocated >= 0),
  actual_spend NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (actual_spend >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_milestone_finance_project_milestone_fkey
    FOREIGN KEY (project_id, milestone_id)
    REFERENCES project_milestones(project_id, id)
    ON DELETE CASCADE
);

CREATE INDEX project_milestone_finance_project_id_idx ON project_milestone_finance(project_id);

CREATE TRIGGER set_project_milestone_finance_updated_at
BEFORE UPDATE ON project_milestone_finance
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Rollback:
-- DROP TABLE IF EXISTS project_milestone_finance;
-- ALTER TABLE project_milestones DROP CONSTRAINT IF EXISTS project_milestones_project_id_id_key;


-- Migration: 037_project_milestone_target_date_nullable.sql
-- Legacy target_date is optional for the activity-style milestone records.
-- The column and all existing values are preserved for older API consumers.
ALTER TABLE project_milestones
  ALTER COLUMN target_date DROP NOT NULL;

-- Rollback:
-- ALTER TABLE project_milestones
--   ALTER COLUMN target_date SET NOT NULL;


-- Migration: 038_project_milestone_actual_dates.sql
-- Additional implementation dates for existing project milestones.
-- The legacy project_milestones.actual_date column remains the first date.
CREATE TABLE project_milestone_actual_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
  actual_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_milestone_actual_dates_unique UNIQUE (milestone_id, actual_date)
);

CREATE INDEX project_milestone_actual_dates_milestone_id_idx
  ON project_milestone_actual_dates(milestone_id);

CREATE TRIGGER set_project_milestone_actual_dates_updated_at
BEFORE UPDATE ON project_milestone_actual_dates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Rollback:
-- DROP TABLE IF EXISTS project_milestone_actual_dates;


-- Migration: 039_work_plan_milestone_link.sql

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

-- Rollback:
-- ALTER TABLE project_work_plan_entries DROP CONSTRAINT IF EXISTS project_work_plan_entries_milestone_project_fkey;
-- DROP INDEX IF EXISTS project_work_plan_entries_milestone_id_idx;
-- ALTER TABLE project_work_plan_entries DROP COLUMN IF EXISTS milestone_id;


-- Migration: 040_project_work_plan_finance.sql

-- Finance rows may reference either the existing milestone/activity master or
-- an existing scheduled Work Plan activity. Existing milestone rows remain
-- keyed by milestone_id and unchanged.
ALTER TABLE project_work_plan_entries
  ADD CONSTRAINT project_work_plan_entries_project_id_id_key UNIQUE (project_id, id);

ALTER TABLE project_milestone_finance
  DROP CONSTRAINT project_milestone_finance_pkey,
  ADD CONSTRAINT project_milestone_finance_milestone_id_key UNIQUE (milestone_id),
  ALTER COLUMN milestone_id DROP NOT NULL,
  ADD COLUMN work_plan_entry_id UUID NULL;

ALTER TABLE project_milestone_finance
  ADD CONSTRAINT project_milestone_finance_one_source_check
  CHECK (((milestone_id IS NOT NULL)::integer + (work_plan_entry_id IS NOT NULL)::integer) = 1);

ALTER TABLE project_milestone_finance
  ADD CONSTRAINT project_milestone_finance_project_work_plan_fkey
  FOREIGN KEY (project_id, work_plan_entry_id)
  REFERENCES project_work_plan_entries(project_id, id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX project_milestone_finance_work_plan_entry_id_key
ON project_milestone_finance(work_plan_entry_id)
WHERE work_plan_entry_id IS NOT NULL;

CREATE INDEX project_milestone_finance_work_plan_entry_project_idx
ON project_milestone_finance(project_id, work_plan_entry_id)
WHERE work_plan_entry_id IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS project_milestone_finance_work_plan_entry_project_idx;
-- DROP INDEX IF EXISTS project_milestone_finance_work_plan_entry_id_key;
-- ALTER TABLE project_milestone_finance DROP CONSTRAINT IF EXISTS project_milestone_finance_project_work_plan_fkey;
-- ALTER TABLE project_milestone_finance DROP CONSTRAINT IF EXISTS project_milestone_finance_one_source_check;
-- ALTER TABLE project_milestone_finance DROP COLUMN IF EXISTS work_plan_entry_id;
-- ALTER TABLE project_milestone_finance ALTER COLUMN milestone_id SET NOT NULL;
-- ALTER TABLE project_milestone_finance DROP CONSTRAINT IF EXISTS project_milestone_finance_milestone_id_key;
-- ALTER TABLE project_milestone_finance ADD CONSTRAINT project_milestone_finance_pkey PRIMARY KEY (milestone_id);
-- ALTER TABLE project_work_plan_entries DROP CONSTRAINT IF EXISTS project_work_plan_entries_project_id_id_key;


-- Migration: 041_project_currency.sql

ALTER TABLE projects
  ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'USD';

ALTER TABLE projects
  ADD CONSTRAINT projects_currency_format_check
  CHECK (currency = UPPER(currency) AND LENGTH(currency) = 3);

-- Rollback:
-- ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_currency_format_check;
-- ALTER TABLE projects DROP COLUMN IF EXISTS currency;


-- Migration: 042_project_milestone_phase.sql

ALTER TABLE project_milestones
  ADD COLUMN phase_id UUID NULL;

ALTER TABLE project_milestones
  ADD CONSTRAINT project_milestones_phase_project_fkey
  FOREIGN KEY (project_id, phase_id)
  REFERENCES phases(project_id, id)
  ON DELETE SET NULL;

CREATE INDEX project_milestones_phase_id_idx
ON project_milestones(phase_id);

-- Rollback:
-- DROP INDEX IF EXISTS project_milestones_phase_id_idx;
-- ALTER TABLE project_milestones DROP CONSTRAINT IF EXISTS project_milestones_phase_project_fkey;
-- ALTER TABLE project_milestones DROP COLUMN IF EXISTS phase_id;


-- Migration: 043_team_calendar_events.sql

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  color VARCHAR(20) NOT NULL DEFAULT 'blue',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_events_time_order CHECK (end_at > start_at),
  CONSTRAINT calendar_events_color_check CHECK (color IN ('blue', 'green', 'red', 'amber', 'purple', 'teal'))
);

CREATE INDEX calendar_events_start_at_idx ON calendar_events(start_at);
CREATE INDEX calendar_events_end_at_idx ON calendar_events(end_at);

-- Rollback:
-- DROP TABLE IF EXISTS calendar_events;



