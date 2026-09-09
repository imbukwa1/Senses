-- Phase 0 sections 9, 15, and 17.
-- Additive live project planning records; not Phase 0-only copies.

CREATE TABLE IF NOT EXISTS project_stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  organisation_group VARCHAR(255) NULL,
  interest_role TEXT NOT NULL,
  influence_importance VARCHAR(100) NULL,
  engagement_notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_stakeholders_project_id_idx ON project_stakeholders(project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_stakeholders_updated_at'
      AND tgrelid = 'project_stakeholders'::regclass
  ) THEN
    CREATE TRIGGER set_project_stakeholders_updated_at
    BEFORE UPDATE ON project_stakeholders
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS project_communication_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  audience TEXT NOT NULL,
  information TEXT NOT NULL,
  frequency VARCHAR(100) NOT NULL,
  responsible_user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  method VARCHAR(150) NOT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_communication_plan_items_project_id_idx ON project_communication_plan_items(project_id);
CREATE INDEX IF NOT EXISTS project_communication_plan_items_responsible_user_id_idx ON project_communication_plan_items(responsible_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_communication_plan_items_updated_at'
      AND tgrelid = 'project_communication_plan_items'::regclass
  ) THEN
    CREATE TRIGGER set_project_communication_plan_items_updated_at
    BEFORE UPDATE ON project_communication_plan_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS project_monitoring_reporting_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  monitored_item TEXT NOT NULL,
  reporting_frequency VARCHAR(100) NOT NULL,
  responsible_user_id UUID NULL REFERENCES users(id) ON DELETE RESTRICT,
  key_measures TEXT NULL,
  reporting_notes TEXT NULL,
  created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_monitoring_reporting_items_project_id_idx ON project_monitoring_reporting_items(project_id);
CREATE INDEX IF NOT EXISTS project_monitoring_reporting_items_responsible_user_id_idx ON project_monitoring_reporting_items(responsible_user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_project_monitoring_reporting_items_updated_at'
      AND tgrelid = 'project_monitoring_reporting_items'::regclass
  ) THEN
    CREATE TRIGGER set_project_monitoring_reporting_items_updated_at
    BEFORE UPDATE ON project_monitoring_reporting_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;

-- Rollback:
-- DROP TABLE IF EXISTS project_monitoring_reporting_items;
-- DROP TABLE IF EXISTS project_communication_plan_items;
-- DROP TABLE IF EXISTS project_stakeholders;
