BEGIN;

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(comment)) > 0)
);

CREATE TABLE task_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name VARCHAR(255) NOT NULL,
  storage_key TEXT NOT NULL,
  file_type VARCHAR(255) NULL,
  file_size BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(file_name)) > 0),
  CHECK (LENGTH(BTRIM(storage_key)) > 0),
  CHECK (file_size >= 0),
  CONSTRAINT task_files_storage_key_key UNIQUE (storage_key)
);

CREATE INDEX comments_task_id_idx ON comments(task_id);
CREATE INDEX comments_user_id_idx ON comments(user_id);
CREATE INDEX comments_created_at_idx ON comments(created_at);

CREATE INDEX task_files_task_id_idx ON task_files(task_id);
CREATE INDEX task_files_uploaded_by_idx ON task_files(uploaded_by);
CREATE INDEX task_files_created_at_idx ON task_files(created_at);

CREATE TRIGGER set_comments_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
