BEGIN;

ALTER TABLE workspace_spreadsheets
  ADD COLUMN univer_unit_id VARCHAR(255) NULL;

CREATE UNIQUE INDEX workspace_spreadsheets_univer_unit_id_idx
  ON workspace_spreadsheets(univer_unit_id)
  WHERE univer_unit_id IS NOT NULL;

-- Rollback:
-- DROP INDEX IF EXISTS workspace_spreadsheets_univer_unit_id_idx;
-- ALTER TABLE workspace_spreadsheets DROP COLUMN IF EXISTS univer_unit_id;

COMMIT;
