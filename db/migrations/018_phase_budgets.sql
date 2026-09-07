ALTER TABLE phases
ADD COLUMN budget_allocated NUMERIC(14,2) NOT NULL DEFAULT 0,
ADD COLUMN budget_spent NUMERIC(14,2) NOT NULL DEFAULT 0,
ADD CONSTRAINT phases_budget_allocated_non_negative CHECK (budget_allocated >= 0),
ADD CONSTRAINT phases_budget_spent_non_negative CHECK (budget_spent >= 0);
