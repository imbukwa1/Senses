BEGIN;

CREATE TABLE project_setup_section_statuses (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  section_key VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL,
  updated_by UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, section_key),
  CONSTRAINT project_setup_section_statuses_status_check
    CHECK (status IN ('Complete', 'In Progress', 'Not Started', 'Not Applicable')),
  CONSTRAINT project_setup_section_statuses_section_key_check
    CHECK (LENGTH(BTRIM(section_key)) > 0)
);

CREATE INDEX project_setup_section_statuses_project_id_idx
ON project_setup_section_statuses(project_id);

CREATE INDEX project_setup_section_statuses_updated_by_idx
ON project_setup_section_statuses(updated_by);

CREATE TRIGGER set_project_setup_section_statuses_updated_at
BEFORE UPDATE ON project_setup_section_statuses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
