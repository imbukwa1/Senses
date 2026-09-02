BEGIN;

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,
  old_values JSONB NULL,
  new_values JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(entity_type)) > 0),
  CHECK (action IN ('CREATE', 'UPDATE')),
  CHECK (
    (action = 'CREATE' AND old_values IS NULL AND new_values IS NOT NULL)
    OR (action = 'UPDATE' AND old_values IS NOT NULL AND new_values IS NOT NULL)
  )
);

CREATE INDEX audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at);

CREATE OR REPLACE FUNCTION current_audit_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID;
$$;

CREATE OR REPLACE FUNCTION write_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  audited_entity_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    audited_entity_id := (to_jsonb(NEW)->>'id')::UUID;

    INSERT INTO audit_logs (
      user_id,
      entity_type,
      entity_id,
      action,
      old_values,
      new_values
    )
    VALUES (
      current_audit_user_id(),
      TG_TABLE_NAME,
      audited_entity_id,
      'CREATE',
      NULL,
      to_jsonb(NEW)
    );

    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    audited_entity_id := (to_jsonb(NEW)->>'id')::UUID;

    INSERT INTO audit_logs (
      user_id,
      entity_type,
      entity_id,
      action,
      old_values,
      new_values
    )
    VALUES (
      current_audit_user_id(),
      TG_TABLE_NAME,
      audited_entity_id,
      'UPDATE',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

CREATE TRIGGER prevent_audit_logs_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_changes();

CREATE TRIGGER prevent_audit_logs_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_changes();

CREATE TRIGGER audit_users_changes
AFTER INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_projects_changes
AFTER INSERT OR UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_phases_changes
AFTER INSERT OR UPDATE ON phases
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_tasks_changes
AFTER INSERT OR UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_task_deliverables_changes
AFTER INSERT OR UPDATE ON task_deliverables
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_comments_changes
AFTER INSERT OR UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

CREATE TRIGGER audit_task_files_changes
AFTER INSERT OR UPDATE ON task_files
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

COMMIT;
