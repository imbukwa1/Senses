BEGIN;

CREATE TABLE workspace_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  folder_id UUID NULL REFERENCES workspace_folders(id) ON DELETE SET NULL,
  task_id UUID NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  content JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::JSONB,
  created_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(name)) > 0)
);

CREATE TABLE workspace_spreadsheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  folder_id UUID NULL REFERENCES workspace_folders(id) ON DELETE SET NULL,
  task_id UUID NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  name VARCHAR(200) NOT NULL,
  content JSONB NOT NULL DEFAULT '{"id":"workbook","name":"Sheet","sheetOrder":[],"sheets":{}}'::JSONB,
  created_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(name)) > 0)
);

CREATE INDEX workspace_documents_project_id_idx ON workspace_documents(project_id);
CREATE INDEX workspace_documents_folder_id_idx ON workspace_documents(folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX workspace_documents_task_id_idx ON workspace_documents(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX workspace_documents_created_by_idx ON workspace_documents(created_by);

CREATE INDEX workspace_spreadsheets_project_id_idx ON workspace_spreadsheets(project_id);
CREATE INDEX workspace_spreadsheets_folder_id_idx ON workspace_spreadsheets(folder_id) WHERE folder_id IS NOT NULL;
CREATE INDEX workspace_spreadsheets_task_id_idx ON workspace_spreadsheets(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX workspace_spreadsheets_created_by_idx ON workspace_spreadsheets(created_by);

CREATE TRIGGER set_workspace_documents_updated_at
BEFORE UPDATE ON workspace_documents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_workspace_spreadsheets_updated_at
BEFORE UPDATE ON workspace_spreadsheets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION enforce_workspace_resource_project_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM workspace_folders
    WHERE workspace_folders.id = NEW.folder_id
      AND workspace_folders.project_id = NEW.project_id
  ) THEN
    RAISE foreign_key_violation USING MESSAGE = 'workspace resource folder must belong to the same project';
  END IF;

  IF NEW.task_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM tasks
    JOIN phases ON phases.id = tasks.phase_id
    WHERE tasks.id = NEW.task_id
      AND phases.project_id = NEW.project_id
  ) THEN
    RAISE foreign_key_violation USING MESSAGE = 'workspace resource task must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_workspace_documents_task_project
BEFORE INSERT OR UPDATE OF project_id, folder_id, task_id ON workspace_documents
FOR EACH ROW
EXECUTE FUNCTION enforce_workspace_resource_project_links();

CREATE TRIGGER enforce_workspace_spreadsheets_task_project
BEFORE INSERT OR UPDATE OF project_id, folder_id, task_id ON workspace_spreadsheets
FOR EACH ROW
EXECUTE FUNCTION enforce_workspace_resource_project_links();

COMMIT;
