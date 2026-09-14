-- Additional implementation dates for existing project milestones.
-- The legacy project_milestones.actual_date column remains the first date.
CREATE TABLE project_milestone_actual_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
  actual_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_milestone_actual_dates_unique UNIQUE (milestone_id, actual_date)
);

CREATE INDEX project_milestone_actual_dates_milestone_id_idx
  ON project_milestone_actual_dates(milestone_id);

CREATE TRIGGER set_project_milestone_actual_dates_updated_at
BEFORE UPDATE ON project_milestone_actual_dates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Rollback:
-- DROP TABLE IF EXISTS project_milestone_actual_dates;
