BEGIN;

CREATE TEMP TABLE workspace_folder_ids (
  user_id UUID,
  project_id UUID,
  other_project_id UUID,
  phase_id UUID,
  task_id UUID,
  root_folder_id UUID,
  child_folder_id UUID,
  other_project_folder_id UUID,
  root_file_id UUID,
  assigned_file_id UUID,
  assigned_file_storage_key TEXT
) ON COMMIT DROP;

WITH inserted_user AS (
  INSERT INTO users (name, email)
  VALUES ('Workspace Folder Tester', 'workspace.folder.tester@example.com')
  RETURNING id
),
inserted_projects AS (
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
    'PRJ-2099-001',
    project_name,
    'Validates workspace folder foundation.',
    inserted_user.id,
    CURRENT_DATE,
    CURRENT_DATE + 30,
    'Active'::project_status
  FROM inserted_user
  CROSS JOIN (
    VALUES
      ('Workspace Folder Project'::TEXT),
      ('Workspace Folder Other Project'::TEXT)
  ) AS projects(project_name)
  RETURNING id, name
),
primary_project AS (
  SELECT id FROM inserted_projects WHERE name = 'Workspace Folder Project'
),
other_project AS (
  SELECT id FROM inserted_projects WHERE name = 'Workspace Folder Other Project'
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
    primary_project.id,
    'Workspace Folder Phase',
    inserted_user.id,
    'In Progress'::phase_status,
    1
  FROM primary_project
  CROSS JOIN inserted_user
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
    'Workspace Folder Task',
    inserted_user.id,
    'Medium'::priority_level,
    'In Progress'::task_status
  FROM inserted_phase
  CROSS JOIN inserted_user
  RETURNING id
),
root_folder AS (
  INSERT INTO workspace_folders (
    project_id,
    parent_folder_id,
    name,
    created_by
  )
  SELECT
    primary_project.id,
    NULL,
    'Root Folder',
    inserted_user.id
  FROM primary_project
  CROSS JOIN inserted_user
  RETURNING id
),
child_folder AS (
  INSERT INTO workspace_folders (
    project_id,
    parent_folder_id,
    name,
    created_by
  )
  SELECT
    primary_project.id,
    root_folder.id,
    'Child Folder',
    inserted_user.id
  FROM primary_project
  CROSS JOIN root_folder
  CROSS JOIN inserted_user
  RETURNING id
),
other_project_folder AS (
  INSERT INTO workspace_folders (
    project_id,
    name,
    created_by
  )
  SELECT
    other_project.id,
    'Other Project Folder',
    inserted_user.id
  FROM other_project
  CROSS JOIN inserted_user
  RETURNING id
),
root_file AS (
  INSERT INTO task_files (
    task_id,
    uploaded_by,
    file_name,
    storage_key,
    file_type,
    file_size
  )
  SELECT
    inserted_task.id,
    inserted_user.id,
    'root-file.pdf',
    'tasks/' || inserted_task.id || '/' || gen_random_uuid() || '-root-file.pdf',
    'application/pdf',
    1024
  FROM inserted_task
  CROSS JOIN inserted_user
  RETURNING id, storage_key
),
assigned_file AS (
  INSERT INTO task_files (
    task_id,
    uploaded_by,
    file_name,
    storage_key,
    file_type,
    file_size,
    folder_id
  )
  SELECT
    inserted_task.id,
    inserted_user.id,
    'assigned-file.pdf',
    'tasks/' || inserted_task.id || '/' || gen_random_uuid() || '-assigned-file.pdf',
    'application/pdf',
    2048,
    child_folder.id
  FROM inserted_task
  CROSS JOIN inserted_user
  CROSS JOIN child_folder
  RETURNING id, storage_key
)
INSERT INTO workspace_folder_ids (
  user_id,
  project_id,
  other_project_id,
  phase_id,
  task_id,
  root_folder_id,
  child_folder_id,
  other_project_folder_id,
  root_file_id,
  assigned_file_id,
  assigned_file_storage_key
)
SELECT
  inserted_user.id,
  primary_project.id,
  other_project.id,
  inserted_phase.id,
  inserted_task.id,
  root_folder.id,
  child_folder.id,
  other_project_folder.id,
  root_file.id,
  assigned_file.id,
  assigned_file.storage_key
FROM inserted_user
CROSS JOIN primary_project
CROSS JOIN other_project
CROSS JOIN inserted_phase
CROSS JOIN inserted_task
CROSS JOIN root_folder
CROSS JOIN child_folder
CROSS JOIN other_project_folder
CROSS JOIN root_file
CROSS JOIN assigned_file;

DO $$
DECLARE
  ids workspace_folder_ids%ROWTYPE;
BEGIN
  SELECT * INTO ids FROM workspace_folder_ids;

  IF NOT EXISTS (
    SELECT 1
    FROM workspace_folders
    WHERE id = ids.root_folder_id
      AND project_id = ids.project_id
      AND parent_folder_id IS NULL
      AND name = 'Root Folder'
      AND created_by = ids.user_id
      AND created_at IS NOT NULL
      AND updated_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Expected root folder with project, creator, and timestamps';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM workspace_folders
    WHERE id = ids.child_folder_id
      AND project_id = ids.project_id
      AND parent_folder_id = ids.root_folder_id
  ) THEN
    RAISE EXCEPTION 'Expected child folder to reference parent in the same project';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM task_files
    WHERE id = ids.root_file_id
      AND folder_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Expected existing-style task file without folder assignment to remain valid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM task_files
    WHERE id = ids.assigned_file_id
      AND folder_id = ids.child_folder_id
      AND storage_key = ids.assigned_file_storage_key
  ) THEN
    RAISE EXCEPTION 'Expected task file folder assignment without storage key changes';
  END IF;
END;
$$;

SAVEPOINT cross_project_parent_check;

DO $$
DECLARE
  ids workspace_folder_ids%ROWTYPE;
BEGIN
  SELECT * INTO ids FROM workspace_folder_ids;

  BEGIN
    INSERT INTO workspace_folders (
      project_id,
      parent_folder_id,
      name,
      created_by
    )
    VALUES (
      ids.project_id,
      ids.other_project_folder_id,
      'Invalid Cross Project Child',
      ids.user_id
    );

    RAISE EXCEPTION 'Expected cross-project folder parent insert to fail';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END;
$$;

ROLLBACK TO SAVEPOINT cross_project_parent_check;

SAVEPOINT cross_project_file_folder_check;

DO $$
DECLARE
  ids workspace_folder_ids%ROWTYPE;
BEGIN
  SELECT * INTO ids FROM workspace_folder_ids;

  BEGIN
    INSERT INTO task_files (
      task_id,
      uploaded_by,
      file_name,
      storage_key,
      file_type,
      file_size,
      folder_id
    )
    VALUES (
      ids.task_id,
      ids.user_id,
      'invalid-folder.pdf',
      'tasks/' || ids.task_id || '/' || gen_random_uuid() || '-invalid-folder.pdf',
      'application/pdf',
      512,
      ids.other_project_folder_id
    );

    RAISE EXCEPTION 'Expected cross-project task file folder assignment to fail';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END;
$$;

ROLLBACK TO SAVEPOINT cross_project_file_folder_check;

ROLLBACK;
