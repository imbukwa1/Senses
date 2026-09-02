BEGIN;

CREATE TEMP TABLE section_9_ids (
  project_lead_id UUID,
  task_owner_id UUID,
  project_id UUID,
  phase_id UUID,
  task_id UUID,
  archived_project_id UUID,
  archived_phase_id UUID,
  archived_phase_task_id UUID
) ON COMMIT DROP;

WITH inserted_users AS (
  INSERT INTO users (name, email)
  VALUES
    ('Section 9 Project Lead', 'section9.lead@example.com'),
    ('Section 9 Task Owner', 'section9.owner@example.com')
  RETURNING id, email
),
lead_user AS (
  SELECT id FROM inserted_users WHERE email = 'section9.lead@example.com'
),
task_owner AS (
  SELECT id FROM inserted_users WHERE email = 'section9.owner@example.com'
),
active_project AS (
  INSERT INTO projects (
    code,
    name,
    description,
    project_lead_id,
    start_date,
    end_date,
    status,
    objectives
  )
  SELECT
    'PRJ-2099-901',
    'River Atlas',
    'Maps water points for search validation.',
    lead_user.id,
    CURRENT_DATE,
    CURRENT_DATE + 30,
    'Active'::project_status,
    'atlas-search-project'
  FROM lead_user
  RETURNING id
),
active_phase AS (
  INSERT INTO phases (
    project_id,
    name,
    description,
    owner_id,
    status,
    display_order,
    objectives
  )
  SELECT
    active_project.id,
    'Baseline Survey',
    'Collects household signal data.',
    lead_user.id,
    'In Progress'::phase_status,
    1,
    'survey-search-phase'
  FROM active_project
  CROSS JOIN lead_user
  RETURNING id, project_id
),
active_task AS (
  INSERT INTO tasks (
    phase_id,
    name,
    description,
    owner_id,
    priority,
    status
  )
  SELECT
    active_phase.id,
    'Validate Sensor Packet',
    'Confirms telemetry checksum evidence.',
    task_owner.id,
    'High'::priority_level,
    'In Progress'::task_status
  FROM active_phase
  CROSS JOIN task_owner
  RETURNING id, phase_id
),
archived_project AS (
  INSERT INTO projects (
    code,
    name,
    description,
    project_lead_id,
    start_date,
    end_date,
    status,
    archived_at
  )
  SELECT
    'PRJ-2099-902',
    'Archived Search Project',
    'archived-project-token',
    lead_user.id,
    CURRENT_DATE,
    CURRENT_DATE + 30,
    'On Hold'::project_status,
    NOW()
  FROM lead_user
  RETURNING id
),
archived_phase AS (
  INSERT INTO phases (
    project_id,
    name,
    description,
    owner_id,
    status,
    display_order,
    archived_at
  )
  SELECT
    active_project.id,
    'Archived Phase',
    'archived-phase-token',
    lead_user.id,
    'Not Started'::phase_status,
    2,
    NOW()
  FROM active_project
  CROSS JOIN lead_user
  RETURNING id
),
archived_phase_task AS (
  INSERT INTO tasks (
    phase_id,
    name,
    description,
    owner_id,
    priority,
    status
  )
  SELECT
    archived_phase.id,
    'Archived Phase Task',
    'archived-phase-task-token',
    task_owner.id,
    'Medium'::priority_level,
    'Not Started'::task_status
  FROM archived_phase
  CROSS JOIN task_owner
  RETURNING id
)
INSERT INTO section_9_ids (
  project_lead_id,
  task_owner_id,
  project_id,
  phase_id,
  task_id,
  archived_project_id,
  archived_phase_id,
  archived_phase_task_id
)
SELECT
  lead_user.id,
  task_owner.id,
  active_project.id,
  active_phase.id,
  active_task.id,
  archived_project.id,
  archived_phase.id,
  archived_phase_task.id
FROM lead_user
CROSS JOIN task_owner
CROSS JOIN active_project
CROSS JOIN active_phase
CROSS JOIN active_task
CROSS JOIN archived_project
CROSS JOIN archived_phase
CROSS JOIN archived_phase_task;

DO $$
DECLARE
  selected_project_id UUID;
  result_count INTEGER;
BEGIN
  SELECT project_id
  INTO selected_project_id
  FROM section_9_ids;

  SELECT COUNT(*)
  INTO result_count
  FROM search_project_phase_task_records('atlas-search-project')
  WHERE result_type = 'project'
    AND project_id = selected_project_id
    AND project_code IS NOT NULL
    AND project_name = 'River Atlas'
    AND phase_id IS NULL
    AND task_id IS NULL;

  IF result_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one project search result, got %', result_count;
  END IF;
END;
$$;

DO $$
DECLARE
  selected_project_id UUID;
  selected_phase_id UUID;
  result_count INTEGER;
BEGIN
  SELECT project_id, phase_id
  INTO selected_project_id, selected_phase_id
  FROM section_9_ids;

  SELECT COUNT(*)
  INTO result_count
  FROM search_project_phase_task_records('survey-search-phase')
  WHERE result_type = 'phase'
    AND project_id = selected_project_id
    AND project_name = 'River Atlas'
    AND phase_id = selected_phase_id
    AND phase_name = 'Baseline Survey'
    AND task_id IS NULL;

  IF result_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one phase search result with project context, got %', result_count;
  END IF;
END;
$$;

DO $$
DECLARE
  selected_project_id UUID;
  selected_phase_id UUID;
  selected_task_id UUID;
  result_count INTEGER;
BEGIN
  SELECT project_id, phase_id, task_id
  INTO selected_project_id, selected_phase_id, selected_task_id
  FROM section_9_ids;

  SELECT COUNT(*)
  INTO result_count
  FROM search_project_phase_task_records('checksum')
  WHERE result_type = 'task'
    AND project_id = selected_project_id
    AND project_name = 'River Atlas'
    AND phase_id = selected_phase_id
    AND phase_name = 'Baseline Survey'
    AND task_id = selected_task_id
    AND task_name = 'Validate Sensor Packet';

  IF result_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one task search result with phase/project context, got %', result_count;
  END IF;
END;
$$;

DO $$
DECLARE
  result_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO result_count
  FROM search_project_phase_task_records('definitely-no-section-9-match');

  IF result_count <> 0 THEN
    RAISE EXCEPTION 'Expected no search results for unmatched query, got %', result_count;
  END IF;
END;
$$;

DO $$
DECLARE
  archived_result_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO archived_result_count
  FROM search_project_phase_task_records('archived-project-token');

  IF archived_result_count <> 0 THEN
    RAISE EXCEPTION 'Expected archived projects to be excluded from search, got %', archived_result_count;
  END IF;

  SELECT COUNT(*)
  INTO archived_result_count
  FROM search_project_phase_task_records('archived-phase-token');

  IF archived_result_count <> 0 THEN
    RAISE EXCEPTION 'Expected archived phases to be excluded from search, got %', archived_result_count;
  END IF;

  SELECT COUNT(*)
  INTO archived_result_count
  FROM search_project_phase_task_records('archived-phase-task-token');

  IF archived_result_count <> 0 THEN
    RAISE EXCEPTION 'Expected tasks under archived phases to be excluded from search, got %', archived_result_count;
  END IF;
END;
$$;

ROLLBACK;
