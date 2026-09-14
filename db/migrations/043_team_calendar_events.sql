BEGIN;

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  color VARCHAR(20) NOT NULL DEFAULT 'blue',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_events_time_order CHECK (end_at > start_at),
  CONSTRAINT calendar_events_color_check CHECK (color IN ('blue', 'green', 'red', 'amber', 'purple', 'teal'))
);

CREATE INDEX calendar_events_start_at_idx ON calendar_events(start_at);
CREATE INDEX calendar_events_end_at_idx ON calendar_events(end_at);

COMMIT;

-- Rollback:
-- DROP TABLE IF EXISTS calendar_events;
