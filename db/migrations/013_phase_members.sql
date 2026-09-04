BEGIN;

CREATE TABLE phase_members (
  phase_id UUID NOT NULL REFERENCES phases(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phase_id, user_id)
);

CREATE INDEX phase_members_phase_id_idx ON phase_members(phase_id);
CREATE INDEX phase_members_user_id_idx ON phase_members(user_id);

CREATE OR REPLACE FUNCTION ensure_phase_member_is_project_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM phases
    JOIN project_members
      ON project_members.project_id = phases.project_id
     AND project_members.user_id = NEW.user_id
    WHERE phases.id = NEW.phase_id
      AND phases.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase member must belong to the parent project'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ensure_phase_member_parent_project_membership
BEFORE INSERT OR UPDATE ON phase_members
FOR EACH ROW
EXECUTE FUNCTION ensure_phase_member_is_project_member();

CREATE OR REPLACE FUNCTION prevent_project_member_removal_with_phase_memberships()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM phase_members
    JOIN phases
      ON phases.id = phase_members.phase_id
    WHERE phases.project_id = OLD.project_id
      AND phase_members.user_id = OLD.user_id
  ) THEN
    RAISE EXCEPTION 'Project member still belongs to project phases'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER prevent_project_member_removal_with_phase_memberships
BEFORE DELETE ON project_members
FOR EACH ROW
EXECUTE FUNCTION prevent_project_member_removal_with_phase_memberships();

COMMIT;
