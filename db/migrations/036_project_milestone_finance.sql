-- Finance tracking for the existing project milestone/activity records.
-- One finance row belongs to one milestone; milestone name/description remain
-- authoritative in project_milestones.
ALTER TABLE project_milestones
  ADD CONSTRAINT project_milestones_project_id_id_key UNIQUE (project_id, id);

CREATE TABLE project_milestone_finance (
  milestone_id UUID PRIMARY KEY REFERENCES project_milestones(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  month VARCHAR(50) NULL,
  allocated NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allocated >= 0),
  actual_spend NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (actual_spend >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_milestone_finance_project_milestone_fkey
    FOREIGN KEY (project_id, milestone_id)
    REFERENCES project_milestones(project_id, id)
    ON DELETE CASCADE
);

CREATE INDEX project_milestone_finance_project_id_idx ON project_milestone_finance(project_id);

CREATE TRIGGER set_project_milestone_finance_updated_at
BEFORE UPDATE ON project_milestone_finance
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Rollback:
-- DROP TABLE IF EXISTS project_milestone_finance;
-- ALTER TABLE project_milestones DROP CONSTRAINT IF EXISTS project_milestones_project_id_id_key;
