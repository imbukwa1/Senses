BEGIN;

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

COMMIT;
