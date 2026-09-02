BEGIN;

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

COMMIT;
