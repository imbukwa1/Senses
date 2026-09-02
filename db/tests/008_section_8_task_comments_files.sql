BEGIN;

CREATE TEMP TABLE section_8_ids (
  project_lead_id UUID,
  contributor_id UUID,
  project_id UUID,
  phase_id UUID,
  task_id UUID
) ON COMMIT DROP;

WITH inserted_users AS (
  INSERT INTO users (name, email)
  VALUES
    ('Section 8 Project Lead', 'section8.lead@example.com'),
    ('Section 8 Contributor', 'section8.contributor@example.com')
  RETURNING id, email
),
lead_user AS (
  SELECT id FROM inserted_users WHERE email = 'section8.lead@example.com'
),
contributor_user AS (
  SELECT id FROM inserted_users WHERE email = 'section8.contributor@example.com'
),
inserted_project AS (
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
    'PRJ-2099-999',
    'Section 8 Validation Project',
    'Validates task comments and task file metadata.',
    lead_user.id,
    CURRENT_DATE,
    CURRENT_DATE + 30,
    'Active'::project_status
  FROM lead_user
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
    'Section 8 Validation Phase',
    lead_user.id,
    'In Progress'::phase_status,
    1
  FROM inserted_project
  CROSS JOIN lead_user
  RETURNING id, project_id
),
inserted_task AS (
  INSERT INTO tasks (
    phase_id,
    name,
    owner_id,
    priority,
    status
  )
  SELECT
    inserted_phase.id,
    'Section 8 Validation Task',
    contributor_user.id,
    'Medium'::priority_level,
    'In Progress'::task_status
  FROM inserted_phase
  CROSS JOIN contributor_user
  RETURNING id, phase_id
)
INSERT INTO section_8_ids (
  project_lead_id,
  contributor_id,
  project_id,
  phase_id,
  task_id
)
SELECT
  lead_user.id,
  contributor_user.id,
  inserted_project.id,
  inserted_phase.id,
  inserted_task.id
FROM lead_user
CROSS JOIN contributor_user
CROSS JOIN inserted_project
CROSS JOIN inserted_phase
CROSS JOIN inserted_task;

INSERT INTO comments (task_id, user_id, comment)
SELECT task_id, project_lead_id, 'First task comment'
FROM section_8_ids;

INSERT INTO comments (task_id, user_id, comment)
SELECT task_id, contributor_id, 'Second task comment'
FROM section_8_ids;

DO $$
DECLARE
  selected_task_id UUID;
  first_author_id UUID;
  second_author_id UUID;
  comment_count INTEGER;
  distinct_task_count INTEGER;
BEGIN
  SELECT task_id, project_lead_id, contributor_id
  INTO selected_task_id, first_author_id, second_author_id
  FROM section_8_ids;

  SELECT COUNT(*), COUNT(DISTINCT task_id)
  INTO comment_count, distinct_task_count
  FROM comments
  WHERE task_id = selected_task_id;

  IF comment_count <> 2 OR distinct_task_count <> 1 THEN
    RAISE EXCEPTION 'Expected two comments associated to one task, got count %, distinct tasks %',
      comment_count,
      distinct_task_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM comments
    WHERE task_id = selected_task_id
      AND user_id = first_author_id
      AND comment = 'First task comment'
      AND created_at IS NOT NULL
      AND updated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Expected first comment author and timestamps to be stored';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM comments
    WHERE task_id = selected_task_id
      AND user_id = second_author_id
      AND comment = 'Second task comment'
  ) THEN
    RAISE EXCEPTION 'Expected second comment author to be stored';
  END IF;
END;
$$;

INSERT INTO task_files (
  task_id,
  uploaded_by,
  file_name,
  storage_key,
  file_type,
  file_size
)
SELECT
  task_id,
  project_lead_id,
  'scope.pdf',
  'tasks/' || task_id || '/' || gen_random_uuid() || '-scope.pdf',
  'application/pdf',
  2048
FROM section_8_ids;

INSERT INTO task_files (
  task_id,
  uploaded_by,
  file_name,
  storage_key,
  file_type,
  file_size
)
SELECT
  task_id,
  contributor_id,
  'notes.txt',
  'tasks/' || task_id || '/' || gen_random_uuid() || '-notes.txt',
  'text/plain',
  128
FROM section_8_ids;

DO $$
DECLARE
  selected_task_id UUID;
  first_uploader_id UUID;
  second_uploader_id UUID;
  file_count INTEGER;
  distinct_storage_key_count INTEGER;
  bytea_column_count INTEGER;
BEGIN
  SELECT task_id, project_lead_id, contributor_id
  INTO selected_task_id, first_uploader_id, second_uploader_id
  FROM section_8_ids;

  SELECT COUNT(*), COUNT(DISTINCT storage_key)
  INTO file_count, distinct_storage_key_count
  FROM task_files
  WHERE task_id = selected_task_id;

  IF file_count <> 2 OR distinct_storage_key_count <> 2 THEN
    RAISE EXCEPTION 'Expected two files with unique storage keys, got count %, distinct keys %',
      file_count,
      distinct_storage_key_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM task_files
    WHERE task_id = selected_task_id
      AND uploaded_by = first_uploader_id
      AND file_name = 'scope.pdf'
      AND storage_key LIKE 'tasks/%/%%-scope.pdf'
      AND file_type = 'application/pdf'
      AND file_size = 2048
      AND created_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Expected uploaded scope.pdf metadata, attribution, storage key, and displayed filename';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM task_files
    WHERE task_id = selected_task_id
      AND uploaded_by = second_uploader_id
      AND file_name = 'notes.txt'
      AND storage_key LIKE 'tasks/%/%%-notes.txt'
      AND file_type = 'text/plain'
      AND file_size = 128
  ) THEN
    RAISE EXCEPTION 'Expected uploaded notes.txt metadata, attribution, storage key, and displayed filename';
  END IF;

  SELECT COUNT(*)
  INTO bytea_column_count
  FROM information_schema.columns
  WHERE table_name = 'task_files'
    AND data_type = 'bytea';

  IF bytea_column_count <> 0 THEN
    RAISE EXCEPTION 'task_files must store metadata only, not binary file data';
  END IF;
END;
$$;

SAVEPOINT duplicate_storage_key_check;

DO $$
DECLARE
  selected_task_id UUID;
  uploader_id UUID;
  existing_storage_key TEXT;
BEGIN
  SELECT ids.task_id, ids.project_lead_id, task_files.storage_key
  INTO selected_task_id, uploader_id, existing_storage_key
  FROM section_8_ids ids
  JOIN task_files ON task_files.task_id = ids.task_id
  LIMIT 1;

  BEGIN
    INSERT INTO task_files (
      task_id,
      uploaded_by,
      file_name,
      storage_key,
      file_type,
      file_size
    )
    VALUES (
      selected_task_id,
      uploader_id,
      'duplicate.pdf',
      existing_storage_key,
      'application/pdf',
      512
    );

    RAISE EXCEPTION 'Expected duplicate storage_key insert to fail';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END;
$$;

ROLLBACK TO SAVEPOINT duplicate_storage_key_check;

ROLLBACK;
