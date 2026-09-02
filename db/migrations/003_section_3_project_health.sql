BEGIN;

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

COMMIT;
