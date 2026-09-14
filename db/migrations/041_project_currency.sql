BEGIN;

ALTER TABLE projects
  ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'USD';

ALTER TABLE projects
  ADD CONSTRAINT projects_currency_format_check
  CHECK (currency = UPPER(currency) AND LENGTH(currency) = 3);

COMMIT;

-- Rollback:
-- ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_currency_format_check;
-- ALTER TABLE projects DROP COLUMN IF EXISTS currency;
