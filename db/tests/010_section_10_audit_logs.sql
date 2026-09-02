BEGIN;

CREATE TEMP TABLE section_10_ids (
  audit_user_id UUID,
  project_id UUID,
  phase_id UUID,
  task_id UUID,
  system_comment_id UUID
) ON COMMIT DROP;

INSERT INTO users (name, email)
VALUES ('Section 10 Audit User', 'section10.audit@example.com');

INSERT INTO section_10_ids (audit_user_id)
SELECT id
FROM users
WHERE email = 'section10.audit@example.com';

SELECT set_config('app.current_user_id', audit_user_id::TEXT, TRUE)
FROM section_10_ids;

WITH inserted_project AS (
  INSERT INTO projects (
    code,
    name,
    description,
    project_lead_id,
    start_date,
    end_date,
    status
  )
  SELECT
    'PRJ-2099-801',
    'Section 10 Audit Project',
    'Initial audit description',
    audit_user_id,
    CURRENT_DATE,
    CURRENT_DATE + 30,
    'Active'::project_status
  FROM section_10_ids
  RETURNING id
),
inserted_phase AS (
  INSERT INTO phases (
    project_id,
    name,
    owner_id,
    status,
    display_order
  )
  SELECT
    inserted_project.id,
    'Section 10 Audit Phase',
    section_10_ids.audit_user_id,
    'In Progress'::phase_status,
    1
  FROM inserted_project
  CROSS JOIN section_10_ids
  RETURNING id, project_id
),
inserted_task AS (
  INSERT INTO tasks (
    phase_id,
    name,
    description,
    owner_id,
    priority,
    status
  )
  SELECT
    inserted_phase.id,
    'Section 10 Audit Task',
    'Initial task description',
    section_10_ids.audit_user_id,
    'Medium'::priority_level,
    'Not Started'::task_status
  FROM inserted_phase
  CROSS JOIN section_10_ids
  RETURNING id, phase_id
)
UPDATE section_10_ids
SET
  project_id = inserted_project.id,
  phase_id = inserted_phase.id,
  task_id = inserted_task.id
FROM inserted_project
CROSS JOIN inserted_phase
CROSS JOIN inserted_task;

DO $$
DECLARE
  selected_user_id UUID;
  selected_project_id UUID;
  create_count INTEGER;
BEGIN
  SELECT audit_user_id, project_id
  INTO selected_user_id, selected_project_id
  FROM section_10_ids;

  SELECT COUNT(*)
  INTO create_count
  FROM audit_logs
  WHERE entity_type = 'projects'
    AND entity_id = selected_project_id
    AND action = 'CREATE'
    AND user_id = selected_user_id
    AND old_values IS NULL
    AND new_values->>'name' = 'Section 10 Audit Project'
    AND new_values->>'code' LIKE 'PRJ-%'
    AND created_at IS NOT NULL;

  IF create_count <> 1 THEN
    RAISE EXCEPTION 'Expected one attributed project CREATE audit row, got %', create_count;
  END IF;
END;
$$;

UPDATE tasks
SET
  name = 'Section 10 Audit Task Updated',
  status = 'In Progress'::task_status
WHERE id = (SELECT task_id FROM section_10_ids);

DO $$
DECLARE
  selected_user_id UUID;
  selected_task_id UUID;
  update_count INTEGER;
BEGIN
  SELECT audit_user_id, task_id
  INTO selected_user_id, selected_task_id
  FROM section_10_ids;

  SELECT COUNT(*)
  INTO update_count
  FROM audit_logs
  WHERE entity_type = 'tasks'
    AND entity_id = selected_task_id
    AND action = 'UPDATE'
    AND user_id = selected_user_id
    AND old_values->>'name' = 'Section 10 Audit Task'
    AND new_values->>'name' = 'Section 10 Audit Task Updated'
    AND old_values->>'status' = 'Not Started'
    AND new_values->>'status' = 'In Progress'
    AND created_at IS NOT NULL;

  IF update_count <> 1 THEN
    RAISE EXCEPTION 'Expected one attributed task UPDATE audit row with old/new values, got %', update_count;
  END IF;
END;
$$;

SELECT set_config('app.current_user_id', '', TRUE);

WITH inserted_comment AS (
  INSERT INTO comments (task_id, user_id, comment)
  SELECT task_id, audit_user_id, 'System-created audit verification comment'
  FROM section_10_ids
  RETURNING id
)
UPDATE section_10_ids
SET system_comment_id = inserted_comment.id
FROM inserted_comment;

DO $$
DECLARE
  selected_comment_id UUID;
  system_count INTEGER;
BEGIN
  SELECT system_comment_id
  INTO selected_comment_id
  FROM section_10_ids;

  SELECT COUNT(*)
  INTO system_count
  FROM audit_logs
  WHERE entity_type = 'comments'
    AND entity_id = selected_comment_id
    AND action = 'CREATE'
    AND user_id IS NULL
    AND new_values->>'comment' = 'System-created audit verification comment'
    AND created_at IS NOT NULL;

  IF system_count <> 1 THEN
    RAISE EXCEPTION 'Expected one system CREATE audit row with NULL user_id, got %', system_count;
  END IF;
END;
$$;

DO $$
DECLARE
  selected_audit_log_id UUID;
BEGIN
  SELECT id
  INTO selected_audit_log_id
  FROM audit_logs
  LIMIT 1;

  BEGIN
    UPDATE audit_logs
    SET action = action
    WHERE id = selected_audit_log_id;

    RAISE EXCEPTION 'Expected audit_logs UPDATE to fail';
  EXCEPTION
    WHEN raise_exception THEN
      NULL;
  END;
END;
$$;

DO $$
DECLARE
  selected_audit_log_id UUID;
BEGIN
  SELECT id
  INTO selected_audit_log_id
  FROM audit_logs
  LIMIT 1;

  BEGIN
    DELETE FROM audit_logs
    WHERE id = selected_audit_log_id;

    RAISE EXCEPTION 'Expected audit_logs DELETE to fail';
  EXCEPTION
    WHEN raise_exception THEN
      NULL;
  END;
END;
$$;

ROLLBACK;
