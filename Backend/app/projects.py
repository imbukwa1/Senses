from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.access import ensure_project_access, fetch_accessible_project, fetch_accessible_projects
from app.auth import AuthenticatedUser, get_current_user
from app.db import DatabaseSession, Row
from app.dependencies import get_authenticated_db_session


router = APIRouter(prefix="/projects", tags=["projects"])

ProjectStatus = Literal["Planning", "Not Started", "Active", "On Hold", "Completed"]
PriorityLevel = Literal["Low", "Medium", "High"]

PROJECT_NOT_FOUND_DETAIL = "Project not found"
USER_NOT_FOUND_DETAIL = "User not found"
REQUIRED_PROJECT_FIELDS = {
    "name",
    "description",
    "project_lead_id",
    "start_date",
    "end_date",
    "status",
}


class ProjectCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    project_lead_id: UUID
    start_date: date
    end_date: date
    status: ProjectStatus
    funder_partner: str | None = Field(default=None, max_length=255)
    project_type: str | None = Field(default=None, max_length=100)
    objectives: str | None = None
    priority: PriorityLevel | None = None


class ProjectUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1)
    project_lead_id: UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: ProjectStatus | None = None
    funder_partner: str | None = Field(default=None, max_length=255)
    project_type: str | None = Field(default=None, max_length=100)
    objectives: str | None = None
    priority: PriorityLevel | None = None


class ProjectResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: str
    project_lead_id: UUID
    current_phase_id: UUID | None
    start_date: date
    end_date: date
    status: str
    funder_partner: str | None
    project_type: str | None
    objectives: str | None
    priority: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class ProjectMemberCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID


class ProjectMemberResponse(BaseModel):
    project_id: UUID
    user_id: UUID
    name: str
    email: str
    joined_at: datetime


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectResponse:
    ensure_user_exists(session, payload.project_lead_id)
    project = session.fetch_one(
        """
        INSERT INTO projects (
          code,
          name,
          description,
          project_lead_id,
          start_date,
          end_date,
          status,
          funder_partner,
          project_type,
          objectives,
          priority
        )
        VALUES (
          'PRJ-0000-000',
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s
        )
        RETURNING *
        """,
        (
            payload.name,
            payload.description,
            payload.project_lead_id,
            payload.start_date,
            payload.end_date,
            payload.status,
            payload.funder_partner,
            payload.project_type,
            payload.objectives,
            payload.priority,
        ),
    )
    session.execute(
        """
        INSERT INTO project_members (project_id, user_id)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
        """,
        (project["id"], current_user.id),
    )
    return project_to_response(project)


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectResponse]:
    return [project_to_response(row) for row in fetch_accessible_projects(session, current_user.id)]


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectResponse:
    project = fetch_accessible_project(session, current_user.id, project_id)
    if project is None:
        raise_project_not_found()

    return project_to_response(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: UUID,
    payload: ProjectUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectResponse:
    ensure_project_access(session, current_user.id, project_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        project = fetch_accessible_project(session, current_user.id, project_id)
        if project is None:
            raise_project_not_found()
        return project_to_response(project)

    null_required_fields = sorted(
        field for field in REQUIRED_PROJECT_FIELDS if field in values and values[field] is None
    )
    if null_required_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Required project fields cannot be null: {', '.join(null_required_fields)}",
        )

    if "project_lead_id" in values:
        ensure_user_exists(session, values["project_lead_id"])

    set_clause = ", ".join(f"{field} = %s" for field in values)
    params = [*values.values(), project_id]
    project = session.fetch_one(
        f"""
        UPDATE projects
        SET {set_clause}
        WHERE id = %s
          AND archived_at IS NULL
        RETURNING *
        """,
        params,
    )
    if project is None:
        raise_project_not_found()

    return project_to_response(project)


@router.patch("/{project_id}/archive", response_model=ProjectResponse)
def archive_project(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectResponse:
    ensure_project_access(session, current_user.id, project_id)
    project = session.fetch_one(
        """
        UPDATE projects
        SET archived_at = COALESCE(archived_at, NOW())
        WHERE id = %s
        RETURNING *
        """,
        (project_id,),
    )
    if project is None:
        raise_project_not_found()

    return project_to_response(project)


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
def list_project_members(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectMemberResponse]:
    ensure_project_access(session, current_user.id, project_id)
    rows = session.fetch_all(
        """
        SELECT
          project_members.project_id,
          users.id AS user_id,
          users.name,
          users.email,
          project_members.joined_at
        FROM project_members
        JOIN users ON users.id = project_members.user_id
        WHERE project_members.project_id = %s
        ORDER BY project_members.joined_at, users.name, users.id
        """,
        (project_id,),
    )
    return [project_member_to_response(row) for row in rows]


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_project_member(
    project_id: UUID,
    payload: ProjectMemberCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectMemberResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_user_exists(session, payload.user_id)
    session.execute(
        """
        INSERT INTO project_members (project_id, user_id)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
        """,
        (project_id, payload.user_id),
    )
    member = fetch_project_member(session, project_id, payload.user_id)
    return project_member_to_response(member)


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_member(
    project_id: UUID,
    user_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    session.execute(
        "DELETE FROM project_members WHERE project_id = %s AND user_id = %s",
        (project_id, user_id),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def ensure_user_exists(session: DatabaseSession, user_id: UUID) -> None:
    row = session.fetch_one("SELECT id FROM users WHERE id = %s", (user_id,))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=USER_NOT_FOUND_DETAIL)


def fetch_project_member(
    session: DatabaseSession,
    project_id: UUID,
    user_id: UUID,
) -> Row:
    row = session.fetch_one(
        """
        SELECT
          project_members.project_id,
          users.id AS user_id,
          users.name,
          users.email,
          project_members.joined_at
        FROM project_members
        JOIN users ON users.id = project_members.user_id
        WHERE project_members.project_id = %s
          AND project_members.user_id = %s
        """,
        (project_id, user_id),
    )
    if row is None:
        raise_project_not_found()
    return row


def project_to_response(row: Row) -> ProjectResponse:
    return ProjectResponse(**row)


def project_member_to_response(row: Row) -> ProjectMemberResponse:
    return ProjectMemberResponse(**row)


def raise_project_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROJECT_NOT_FOUND_DETAIL)
