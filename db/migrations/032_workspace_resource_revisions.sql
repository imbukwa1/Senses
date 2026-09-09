BEGIN;

CREATE TABLE workspace_resource_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  resource_type VARCHAR(32) NOT NULL,
  resource_id UUID NOT NULL,
  snapshot JSONB NULL,
  yjs_state BYTEA NULL,
  label VARCHAR(200) NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_resource_revisions_type_check
    CHECK (resource_type IN ('document', 'spreadsheet')),
  CONSTRAINT workspace_resource_revisions_payload_check
    CHECK ((snapshot IS NULL) <> (yjs_state IS NULL))
);

CREATE INDEX workspace_resource_revisions_resource_idx
  ON workspace_resource_revisions(project_id, resource_type, resource_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION enforce_workspace_revision_project_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.resource_type = 'document' AND NOT EXISTS (
    SELECT 1 FROM workspace_documents
    WHERE id = NEW.resource_id AND project_id = NEW.project_id
  ) THEN
    RAISE foreign_key_violation USING MESSAGE = 'document revision resource must belong to the same project';
  END IF;

  IF NEW.resource_type = 'spreadsheet' AND NOT EXISTS (
    SELECT 1 FROM workspace_spreadsheets
    WHERE id = NEW.resource_id AND project_id = NEW.project_id
  ) THEN
    RAISE foreign_key_violation USING MESSAGE = 'spreadsheet revision resource must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_workspace_revision_project_link
BEFORE INSERT OR UPDATE OF project_id, resource_type, resource_id ON workspace_resource_revisions
FOR EACH ROW
EXECUTE FUNCTION enforce_workspace_revision_project_link();

COMMIT;
