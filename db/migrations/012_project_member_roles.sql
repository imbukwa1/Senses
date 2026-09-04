BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_member_role') THEN
    CREATE TYPE project_member_role AS ENUM (
      'PM',
      'Team Member',
      'Finance'
    );
  END IF;
END;
$$;

ALTER TABLE project_members
ADD COLUMN IF NOT EXISTS role project_member_role;

UPDATE project_members
SET role = 'Team Member'
WHERE role IS NULL;

UPDATE project_members
SET role = 'PM'
FROM projects
WHERE projects.id = project_members.project_id
  AND projects.project_lead_id = project_members.user_id;

INSERT INTO project_members (project_id, user_id, role)
SELECT projects.id, projects.project_lead_id, 'PM'
FROM projects
ON CONFLICT (project_id, user_id)
DO UPDATE SET role = 'PM'
WHERE project_members.role <> 'PM';

ALTER TABLE project_members
ALTER COLUMN role SET DEFAULT 'Team Member';

ALTER TABLE project_members
ALTER COLUMN role SET NOT NULL;

CREATE INDEX IF NOT EXISTS project_members_project_role_idx
ON project_members(project_id, role);

COMMIT;
