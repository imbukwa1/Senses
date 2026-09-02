BEGIN;

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

COMMIT;
