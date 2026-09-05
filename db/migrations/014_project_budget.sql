BEGIN;

ALTER TABLE projects
ADD COLUMN budget_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
ADD COLUMN budget_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
ADD CONSTRAINT projects_budget_allocated_non_negative CHECK (budget_allocated >= 0),
ADD CONSTRAINT projects_budget_spent_non_negative CHECK (budget_spent >= 0);

COMMIT;
