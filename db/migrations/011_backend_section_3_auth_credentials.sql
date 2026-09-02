BEGIN;

CREATE TABLE user_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (LENGTH(BTRIM(password_hash)) > 0)
);

CREATE TRIGGER set_user_credentials_updated_at
BEFORE UPDATE ON user_credentials
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
