ALTER TABLE task_files
DROP CONSTRAINT task_files_file_category_check,
ADD CONSTRAINT task_files_file_category_check
  CHECK (file_category IN ('reference', 'work_submission', 'finance'));
