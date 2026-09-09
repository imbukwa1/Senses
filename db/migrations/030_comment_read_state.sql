-- Per-user task comment last-seen state. Comment rows remain unchanged.
CREATE TABLE IF NOT EXISTS comment_read_state (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  last_seen_comment_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, task_id)
);

CREATE INDEX IF NOT EXISTS comment_read_state_task_idx ON comment_read_state(task_id);
