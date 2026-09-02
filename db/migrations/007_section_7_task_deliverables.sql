BEGIN;

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

COMMIT;
