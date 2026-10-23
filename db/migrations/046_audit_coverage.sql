BEGIN;

-- The shared write_audit_log() trigger function already records INSERT,
-- UPDATE, and DELETE events, including OLD values for deletes. Recreate only
-- the table triggers so this migration is idempotent and cannot duplicate
-- existing trigger names or audit rows.

DROP TRIGGER IF EXISTS audit_project_stakeholders_changes ON project_stakeholders;
CREATE TRIGGER audit_project_stakeholders_changes
AFTER INSERT OR UPDATE OR DELETE ON project_stakeholders
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

DROP TRIGGER IF EXISTS audit_project_resources_changes ON project_resources;
CREATE TRIGGER audit_project_resources_changes
AFTER INSERT OR UPDATE OR DELETE ON project_resources
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

DROP TRIGGER IF EXISTS audit_project_work_plan_entries_changes ON project_work_plan_entries;
CREATE TRIGGER audit_project_work_plan_entries_changes
AFTER INSERT OR UPDATE OR DELETE ON project_work_plan_entries
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

DROP TRIGGER IF EXISTS audit_task_files_changes ON task_files;
CREATE TRIGGER audit_task_files_changes
AFTER INSERT OR UPDATE OR DELETE ON task_files
FOR EACH ROW
EXECUTE FUNCTION write_audit_log();

COMMIT;
