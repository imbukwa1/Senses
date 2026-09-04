from uuid import UUID

from fastapi import Depends, HTTPException, status

from app.auth import AuthenticatedUser, get_current_user
from app.db import DatabaseSession
from app.dependencies import get_authenticated_db_session


PROJECT_ACCESS_DENIED_DETAIL = "Project access denied"
PROJECT_PM_REQUIRED_DETAIL = "Project PM role is required"


def user_can_access_project(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
) -> bool:
    row = session.fetch_one(
        """
        SELECT EXISTS (
          SELECT 1
          FROM project_members
          JOIN projects
            ON projects.id = project_members.project_id
          WHERE project_members.project_id = %s
            AND project_members.user_id = %s
            AND projects.archived_at IS NULL
        ) AS can_access
        """,
        (project_id, user_id),
    )
    return bool(row["can_access"])


def fetch_accessible_projects(
    session: DatabaseSession,
    user_id: UUID,
) -> list:
    return session.fetch_all(
        """
        SELECT
          project_health.*,
          users.name AS project_lead_name,
          users.email AS project_lead_email
        FROM project_health
        JOIN project_members
          ON project_members.project_id = project_health.id
        JOIN users
          ON users.id = project_health.project_lead_id
        WHERE project_members.user_id = %s
          AND project_health.archived_at IS NULL
        ORDER BY project_health.created_at DESC, project_health.id
        """,
        (user_id,),
    )


def fetch_accessible_project(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
):
    return session.fetch_one(
        """
        SELECT
          project_health.*,
          users.name AS project_lead_name,
          users.email AS project_lead_email
        FROM project_health
        JOIN project_members
          ON project_members.project_id = project_health.id
        JOIN users
          ON users.id = project_health.project_lead_id
        WHERE project_health.id = %s
          AND project_members.user_id = %s
          AND project_health.archived_at IS NULL
        """,
        (project_id, user_id),
    )


def ensure_project_access(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
) -> None:
    if not user_can_access_project(session, user_id, project_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PROJECT_ACCESS_DENIED_DETAIL,
        )


def fetch_project_member_role(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
) -> str | None:
    row = session.fetch_one(
        """
        SELECT project_members.role
        FROM project_members
        JOIN projects
          ON projects.id = project_members.project_id
        WHERE project_members.project_id = %s
          AND project_members.user_id = %s
          AND projects.archived_at IS NULL
        """,
        (project_id, user_id),
    )
    return None if row is None else row["role"]


def ensure_project_pm(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
) -> None:
    if fetch_project_member_role(session, user_id, project_id) != "PM":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PROJECT_PM_REQUIRED_DETAIL,
        )


def require_project_access(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> UUID:
    ensure_project_access(session, current_user.id, project_id)
    return project_id
