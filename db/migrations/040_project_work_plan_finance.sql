BEGIN;

-- Finance rows may reference either the existing milestone/activity master or
-- an existing scheduled Work Plan activity. Existing milestone rows remain
-- keyed by milestone_id and unchanged.
ALTER TABLE project_work_plan_entries
  ADD CONSTRAINT project_work_plan_entries_project_id_id_key UNIQUE (project_id, id);

ALTER TABLE project_milestone_finance
  DROP CONSTRAINT project_milestone_finance_pkey,
  ADD CONSTRAINT project_milestone_finance_milestone_id_key UNIQUE (milestone_id),
  ALTER COLUMN milestone_id DROP NOT NULL,
  ADD COLUMN work_plan_entry_id UUID NULL;

ALTER TABLE project_milestone_finance
  ADD CONSTRAINT project_milestone_finance_one_source_check
  CHECK (((milestone_id IS NOT NULL)::integer + (work_plan_entry_id IS NOT NULL)::integer) = 1);

ALTER TABLE project_milestone_finance
  ADD CONSTRAINT project_milestone_finance_project_work_plan_fkey
  FOREIGN KEY (project_id, work_plan_entry_id)
  REFERENCES project_work_plan_entries(project_id, id)
  ON DELETE CASCADE;

CREATE UNIQUE INDEX project_milestone_finance_work_plan_entry_id_key
ON project_milestone_finance(work_plan_entry_id)
WHERE work_plan_entry_id IS NOT NULL;

CREATE INDEX project_milestone_finance_work_plan_entry_project_idx
ON project_milestone_finance(project_id, work_plan_entry_id)
WHERE work_plan_entry_id IS NOT NULL;

COMMIT;

-- Rollback:
-- DROP INDEX IF EXISTS project_milestone_finance_work_plan_entry_project_idx;
-- DROP INDEX IF EXISTS project_milestone_finance_work_plan_entry_id_key;
-- ALTER TABLE project_milestone_finance DROP CONSTRAINT IF EXISTS project_milestone_finance_project_work_plan_fkey;
-- ALTER TABLE project_milestone_finance DROP CONSTRAINT IF EXISTS project_milestone_finance_one_source_check;
-- ALTER TABLE project_milestone_finance DROP COLUMN IF EXISTS work_plan_entry_id;
-- ALTER TABLE project_milestone_finance ALTER COLUMN milestone_id SET NOT NULL;
-- ALTER TABLE project_milestone_finance DROP CONSTRAINT IF EXISTS project_milestone_finance_milestone_id_key;
-- ALTER TABLE project_milestone_finance ADD CONSTRAINT project_milestone_finance_pkey PRIMARY KEY (milestone_id);
-- ALTER TABLE project_work_plan_entries DROP CONSTRAINT IF EXISTS project_work_plan_entries_project_id_id_key;
