BEGIN;

ALTER TABLE task_files
ADD COLUMN file_category VARCHAR(32) NOT NULL DEFAULT 'reference',
ADD CONSTRAINT task_files_file_category_check
  CHECK (file_category IN ('reference', 'work_submission'));

COMMIT;
