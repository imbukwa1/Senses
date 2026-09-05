BEGIN;

ALTER TABLE audit_logs
DROP CONSTRAINT IF EXISTS audit_logs_action_check,
DROP CONSTRAINT IF EXISTS audit_logs_check,
DROP CONSTRAINT IF EXISTS audit_logs_values_check;

ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_action_check CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
ADD CONSTRAINT audit_logs_values_check CHECK (
  (action = 'CREATE' AND old_values IS NULL AND new_values IS NOT NULL)
  OR (action = 'UPDATE' AND old_values IS NOT NULL AND new_values IS NOT NULL)
  OR (action = 'DELETE' AND old_values IS NOT NULL AND new_values IS NULL)
);

CREATE OR REPLACE FUNCTION deterministic_audit_uuid(value TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    SUBSTRING(md5(value) FROM 1 FOR 8) || '-' ||
    SUBSTRING(md5(value) FROM 9 FOR 4) || '-' ||
    SUBSTRING(md5(value) FROM 13 FOR 4) || '-' ||
    SUBSTRING(md5(value) FROM 17 FOR 4) || '-' ||
    SUBSTRING(md5(value) FROM 21 FOR 12)
  )::UUID;
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
  ELSIF TG_OP = 'DELETE' THEN
    audited_entity_id := (to_jsonb(OLD)->>'id')::UUID;

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
      'DELETE',
      to_jsonb(OLD),
      NULL
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION write_membership_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  record_values JSONB;
  audited_entity_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    record_values := to_jsonb(OLD);
  ELSE
    record_values := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'project_members' THEN
    audited_entity_id := deterministic_audit_uuid((record_values->>'project_id') || ':' || (record_values->>'user_id'));
  ELSIF TG_TABLE_NAME = 'phase_members' THEN
    audited_entity_id := deterministic_audit_uuid((record_values->>'phase_id') || ':' || (record_values->>'user_id'));
  ELSIF TG_TABLE_NAME = 'task_supporters' THEN
    audited_entity_id := deterministic_audit_uuid((record_values->>'task_id') || ':' || (record_values->>'user_id'));
  ELSE
    RAISE EXCEPTION 'Unsupported membership audit table: %', TG_TABLE_NAME;
  END IF;

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
    CASE TG_OP
      WHEN 'INSERT' THEN 'CREATE'
      WHEN 'UPDATE' THEN 'UPDATE'
      ELSE 'DELETE'
    END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_project_members_changes ON project_members;
CREATE TRIGGER audit_project_members_changes
AFTER INSERT OR UPDATE OR DELETE ON project_members
FOR EACH ROW
EXECUTE FUNCTION write_membership_audit_log();

DROP TRIGGER IF EXISTS audit_phase_members_changes ON phase_members;
CREATE TRIGGER audit_phase_members_changes
AFTER INSERT OR UPDATE OR DELETE ON phase_members
FOR EACH ROW
EXECUTE FUNCTION write_membership_audit_log();

DROP TRIGGER IF EXISTS audit_task_supporters_changes ON task_supporters;
CREATE TRIGGER audit_task_supporters_changes
AFTER INSERT OR UPDATE OR DELETE ON task_supporters
FOR EACH ROW
EXECUTE FUNCTION write_membership_audit_log();

COMMIT;
