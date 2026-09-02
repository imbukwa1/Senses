BEGIN;

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

COMMIT;
