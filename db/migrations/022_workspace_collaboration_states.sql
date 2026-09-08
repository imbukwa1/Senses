BEGIN;

CREATE TABLE workspace_collaboration_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type VARCHAR(32) NOT NULL,
  resource_id UUID NOT NULL,
  yjs_state BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workspace_collaboration_states_resource_type_check
    CHECK (resource_type IN ('document')),
  CONSTRAINT workspace_collaboration_states_resource_key
    UNIQUE (resource_type, resource_id),
  CONSTRAINT workspace_collaboration_states_document_fkey
    FOREIGN KEY (resource_id)
    REFERENCES workspace_documents(id)
    ON DELETE CASCADE
);

CREATE INDEX workspace_collaboration_states_resource_id_idx
ON workspace_collaboration_states(resource_id);

CREATE TRIGGER set_workspace_collaboration_states_updated_at
BEFORE UPDATE ON workspace_collaboration_states
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
