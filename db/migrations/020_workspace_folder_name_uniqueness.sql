BEGIN;

CREATE UNIQUE INDEX workspace_folders_project_parent_name_key
ON workspace_folders (
  project_id,
  COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::UUID),
  LOWER(BTRIM(name))
);

COMMIT;
