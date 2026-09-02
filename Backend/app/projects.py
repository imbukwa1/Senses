from datetime import date, datetime
from decimal import Decimal
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
PhaseStatus = Literal["Not Started", "In Progress", "Completed"]
PriorityLevel = Literal["Low", "Medium", "High"]

PROJECT_NOT_FOUND_DETAIL = "Project not found"
PHASE_NOT_FOUND_DETAIL = "Phase not found"
USER_NOT_FOUND_DETAIL = "User not found"
PROJECT_LEAD_REQUIRED_DETAIL = "Project lead is required to change project status"
REQUIRED_PROJECT_FIELDS = {
    "name",
    "description",
    "project_lead_id",
    "start_date",
    "end_date",
    "status",
}
REQUIRED_PHASE_FIELDS = {
    "name",
    "status",
    "display_order",
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


class ProjectStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ProjectStatus


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
    health: str
    health_color: str
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


class PhaseCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    owner_id: UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: PhaseStatus = "Not Started"
    display_order: int = Field(gt=0)
    objectives: str | None = None


class PhaseUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    owner_id: UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: PhaseStatus | None = None
    display_order: int | None = Field(default=None, gt=0)
    objectives: str | None = None


class PhaseReorderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase_ids: list[UUID] = Field(min_length=1)


class CurrentPhaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase_id: UUID | None


class PhaseResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    description: str | None
    owner_id: UUID | None
    start_date: date | None
    end_date: date | None
    status: str
    display_order: int
    objectives: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class ProjectMemberResponse(BaseModel):
    project_id: UUID
    user_id: UUID
    name: str
    email: str
    joined_at: datetime


class ProjectLeadResponse(BaseModel):
    id: UUID
    name: str
    email: str


class DashboardProjectResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: str
    project_lead: ProjectLeadResponse
    status: str
    health: str
    health_color: str
    overall_progress: Decimal
    current_phase_id: UUID | None
    start_date: date
    end_date: date
    priority: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DashboardPhaseResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    description: str | None
    owner_id: UUID | None
    start_date: date | None
    end_date: date | None
    status: str
    display_order: int
    objectives: str | None
    progress: Decimal
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class UpcomingDeadlineResponse(BaseModel):
    entity_type: str
    entity_id: UUID
    name: str
    deadline_date: date
    phase_id: UUID | None
    project_id: UUID


class DashboardDeliverableResponse(BaseModel):
    id: UUID
    task_id: UUID
    task_name: str
    phase_id: UUID
    phase_name: str
    description: str
    is_completed: bool
    display_order: int
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProjectDashboardResponse(BaseModel):
    project: DashboardProjectResponse
    current_phase: DashboardPhaseResponse | None
    upcoming_deadlines: list[UpcomingDeadlineResponse]
    phases: list[DashboardPhaseResponse]
    deliverables: list[DashboardDeliverableResponse]


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
    return project_to_response(fetch_project_health_by_id(session, project["id"]))


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


@router.get("/{project_id}/dashboard", response_model=ProjectDashboardResponse)
def get_project_dashboard(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectDashboardResponse:
    ensure_project_access(session, current_user.id, project_id)
    project = fetch_dashboard_project(session, project_id)
    if project is None:
        raise_project_not_found()

    phases = [dashboard_phase_to_response(row) for row in fetch_dashboard_phases(session, project_id)]
    current_phase = next(
        (phase for phase in phases if phase.id == project["current_phase_id"]),
        None,
    )
    deadlines = [
        UpcomingDeadlineResponse(**row)
        for row in fetch_upcoming_deadlines(session, project_id)
    ]
    deliverables = [
        DashboardDeliverableResponse(**row)
        for row in fetch_dashboard_deliverables(session, project_id)
    ]

    return ProjectDashboardResponse(
        project=dashboard_project_to_response(project),
        current_phase=current_phase,
        upcoming_deadlines=deadlines,
        phases=phases,
        deliverables=deliverables,
    )


@router.post("/{project_id}/phases", response_model=PhaseResponse, status_code=status.HTTP_201_CREATED)
def create_phase(
    project_id: UUID,
    payload: PhaseCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> PhaseResponse:
    ensure_project_access(session, current_user.id, project_id)
    if payload.owner_id is not None:
        ensure_user_exists(session, payload.owner_id)
    phase = session.fetch_one(
        """
        INSERT INTO phases (
          project_id,
          name,
          description,
          owner_id,
          start_date,
          end_date,
          status,
          display_order,
          objectives
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            project_id,
            payload.name,
            payload.description,
            payload.owner_id,
            payload.start_date,
            payload.end_date,
            payload.status,
            payload.display_order,
            payload.objectives,
        ),
    )
    return phase_to_response(phase)


@router.get("/{project_id}/phases", response_model=list[PhaseResponse])
def list_phases(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[PhaseResponse]:
    ensure_project_access(session, current_user.id, project_id)
    return [phase_to_response(row) for row in fetch_project_phases(session, project_id)]


@router.patch("/{project_id}/phases/reorder", response_model=list[PhaseResponse])
def reorder_phases(
    project_id: UUID,
    payload: PhaseReorderRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[PhaseResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if len(set(payload.phase_ids)) != len(payload.phase_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Phase IDs must be unique",
        )

    active_phase_ids = [row["id"] for row in fetch_project_phases(session, project_id)]
    if set(active_phase_ids) != set(payload.phase_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Reorder must include every active phase for the project exactly once",
        )

    session.execute("SET CONSTRAINTS phases_project_display_order_key DEFERRED")
    for display_order, phase_id in enumerate(payload.phase_ids, start=1):
        session.execute(
            """
            UPDATE phases
            SET display_order = %s
            WHERE id = %s
              AND project_id = %s
              AND archived_at IS NULL
            """,
            (display_order, phase_id, project_id),
        )

    return [phase_to_response(row) for row in fetch_project_phases(session, project_id)]


@router.patch("/{project_id}/current-phase", response_model=ProjectResponse)
def set_current_phase(
    project_id: UUID,
    payload: CurrentPhaseRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectResponse:
    ensure_project_access(session, current_user.id, project_id)
    if payload.phase_id is not None:
        ensure_phase_in_project(session, project_id, payload.phase_id)

    project = session.fetch_one(
        """
        UPDATE projects
        SET current_phase_id = %s
        WHERE id = %s
          AND archived_at IS NULL
        RETURNING id
        """,
        (payload.phase_id, project_id),
    )
    if project is None:
        raise_project_not_found()

    return project_to_response(fetch_project_health_by_id(session, project["id"]))


@router.get("/{project_id}/phases/{phase_id}", response_model=PhaseResponse)
def get_phase(
    project_id: UUID,
    phase_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> PhaseResponse:
    ensure_project_access(session, current_user.id, project_id)
    phase = fetch_project_phase(session, project_id, phase_id)
    if phase is None:
        raise_phase_not_found()
    return phase_to_response(phase)


@router.patch("/{project_id}/phases/{phase_id}", response_model=PhaseResponse)
def update_phase(
    project_id: UUID,
    phase_id: UUID,
    payload: PhaseUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> PhaseResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_phase_in_project(session, project_id, phase_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return phase_to_response(fetch_project_phase_or_404(session, project_id, phase_id))

    null_required_fields = sorted(
        field for field in REQUIRED_PHASE_FIELDS if field in values and values[field] is None
    )
    if null_required_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Required phase fields cannot be null: {', '.join(null_required_fields)}",
        )
    if "owner_id" in values and values["owner_id"] is not None:
        ensure_user_exists(session, values["owner_id"])

    set_clause = ", ".join(f"{field} = %s" for field in values)
    params = [*values.values(), phase_id, project_id]
    phase = session.fetch_one(
        f"""
        UPDATE phases
        SET {set_clause}
        WHERE id = %s
          AND project_id = %s
          AND archived_at IS NULL
        RETURNING *
        """,
        params,
    )
    if phase is None:
        raise_phase_not_found()

    return phase_to_response(phase)


@router.patch("/{project_id}/phases/{phase_id}/complete", response_model=PhaseResponse)
def mark_phase_complete(
    project_id: UUID,
    phase_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> PhaseResponse:
    ensure_project_access(session, current_user.id, project_id)
    phase = session.fetch_one(
        """
        UPDATE phases
        SET status = 'Completed'
        WHERE id = %s
          AND project_id = %s
          AND archived_at IS NULL
        RETURNING *
        """,
        (phase_id, project_id),
    )
    if phase is None:
        raise_phase_not_found()

    return phase_to_response(phase)


@router.patch("/{project_id}/phases/{phase_id}/archive", response_model=PhaseResponse)
def archive_phase(
    project_id: UUID,
    phase_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> PhaseResponse:
    ensure_project_access(session, current_user.id, project_id)
    phase = session.fetch_one(
        """
        UPDATE phases
        SET archived_at = COALESCE(archived_at, NOW())
        WHERE id = %s
          AND project_id = %s
          AND archived_at IS NULL
        RETURNING *
        """,
        (phase_id, project_id),
    )
    if phase is None:
        raise_phase_not_found()
    session.execute(
        """
        UPDATE projects
        SET current_phase_id = NULL
        WHERE id = %s
          AND current_phase_id = %s
        """,
        (project_id, phase_id),
    )

    return phase_to_response(phase)


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
    if "status" in values:
        ensure_project_lead(session, current_user.id, project_id)

    set_clause = ", ".join(f"{field} = %s" for field in values)
    params = [*values.values(), project_id]
    project = session.fetch_one(
        f"""
        UPDATE projects
        SET {set_clause}
        WHERE id = %s
          AND archived_at IS NULL
        RETURNING id
        """,
        params,
    )
    if project is None:
        raise_project_not_found()

    return project_to_response(fetch_project_health_by_id(session, project["id"]))


@router.patch("/{project_id}/status", response_model=ProjectResponse)
def update_project_status(
    project_id: UUID,
    payload: ProjectStatusUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_lead(session, current_user.id, project_id)
    project = session.fetch_one(
        """
        UPDATE projects
        SET status = %s
        WHERE id = %s
          AND archived_at IS NULL
        RETURNING id
        """,
        (payload.status, project_id),
    )
    if project is None:
        raise_project_not_found()

    return project_to_response(fetch_project_health_by_id(session, project["id"]))


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
        RETURNING id
        """,
        (project_id,),
    )
    if project is None:
        raise_project_not_found()

    return project_to_response(fetch_project_health_by_id(session, project["id"]))


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


def fetch_project_health_by_id(session: DatabaseSession, project_id: UUID) -> Row:
    row = session.fetch_one("SELECT * FROM project_health WHERE id = %s", (project_id,))
    if row is None:
        raise_project_not_found()
    return row


def fetch_dashboard_project(session: DatabaseSession, project_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT
          project_dashboard.id,
          project_dashboard.code,
          project_dashboard.project_name AS name,
          project_dashboard.description,
          project_dashboard.project_lead_id,
          project_dashboard.project_lead_name,
          project_dashboard.project_lead_email,
          project_dashboard.status,
          project_dashboard.health,
          project_dashboard.health_color,
          calculate_average_progress(ARRAY_AGG(task_progress.progress)) AS overall_progress,
          project_dashboard.current_phase_id,
          project_dashboard.start_date,
          project_dashboard.end_date,
          project_dashboard.priority,
          project_dashboard.archived_at,
          project_dashboard.created_at,
          project_dashboard.updated_at
        FROM project_dashboard
        LEFT JOIN phases
          ON phases.project_id = project_dashboard.id
         AND phases.archived_at IS NULL
        LEFT JOIN tasks
          ON tasks.phase_id = phases.id
        LEFT JOIN task_progress
          ON task_progress.task_id = tasks.id
        WHERE project_dashboard.id = %s
          AND project_dashboard.archived_at IS NULL
        GROUP BY
          project_dashboard.id,
          project_dashboard.code,
          project_dashboard.project_name,
          project_dashboard.description,
          project_dashboard.project_lead_id,
          project_dashboard.project_lead_name,
          project_dashboard.project_lead_email,
          project_dashboard.status,
          project_dashboard.health,
          project_dashboard.health_color,
          project_dashboard.current_phase_id,
          project_dashboard.start_date,
          project_dashboard.end_date,
          project_dashboard.priority,
          project_dashboard.archived_at,
          project_dashboard.created_at,
          project_dashboard.updated_at
        """,
        (project_id,),
    )


def fetch_dashboard_phases(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          phases.id,
          phases.project_id,
          phases.name,
          phases.description,
          phases.owner_id,
          phases.start_date,
          phases.end_date,
          phases.status,
          phases.display_order,
          phases.objectives,
          calculate_average_progress(ARRAY_AGG(task_progress.progress)) AS progress,
          phases.created_at,
          phases.updated_at,
          phases.archived_at
        FROM phases
        LEFT JOIN tasks
          ON tasks.phase_id = phases.id
        LEFT JOIN task_progress
          ON task_progress.task_id = tasks.id
        WHERE phases.project_id = %s
          AND phases.archived_at IS NULL
        GROUP BY phases.id
        ORDER BY phases.display_order, phases.created_at, phases.id
        """,
        (project_id,),
    )


def fetch_upcoming_deadlines(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          'project' AS entity_type,
          projects.id AS entity_id,
          projects.name,
          projects.end_date AS deadline_date,
          NULL::UUID AS phase_id,
          projects.id AS project_id
        FROM projects
        WHERE projects.id = %s
          AND projects.archived_at IS NULL
          AND projects.end_date >= CURRENT_DATE
        UNION ALL
        SELECT
          'phase' AS entity_type,
          phases.id AS entity_id,
          phases.name,
          phases.end_date AS deadline_date,
          phases.id AS phase_id,
          phases.project_id
        FROM phases
        WHERE phases.project_id = %s
          AND phases.archived_at IS NULL
          AND phases.end_date IS NOT NULL
          AND phases.end_date >= CURRENT_DATE
        UNION ALL
        SELECT
          'task' AS entity_type,
          tasks.id AS entity_id,
          tasks.name,
          tasks.due_date AS deadline_date,
          phases.id AS phase_id,
          phases.project_id
        FROM tasks
        JOIN phases ON phases.id = tasks.phase_id
        WHERE phases.project_id = %s
          AND phases.archived_at IS NULL
          AND tasks.due_date IS NOT NULL
          AND tasks.due_date >= CURRENT_DATE
        ORDER BY deadline_date, entity_type, name, entity_id
        """,
        (project_id, project_id, project_id),
    )


def fetch_dashboard_deliverables(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          task_deliverables.id,
          task_deliverables.task_id,
          tasks.name AS task_name,
          phases.id AS phase_id,
          phases.name AS phase_name,
          task_deliverables.description,
          task_deliverables.is_completed,
          task_deliverables.display_order,
          task_deliverables.completed_at,
          task_deliverables.created_at,
          task_deliverables.updated_at
        FROM task_deliverables
        JOIN tasks ON tasks.id = task_deliverables.task_id
        JOIN phases ON phases.id = tasks.phase_id
        WHERE phases.project_id = %s
          AND phases.archived_at IS NULL
        ORDER BY phases.display_order, tasks.created_at, tasks.id, task_deliverables.display_order
        """,
        (project_id,),
    )


def fetch_project_phases(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT *
        FROM phases
        WHERE project_id = %s
          AND archived_at IS NULL
        ORDER BY display_order, created_at, id
        """,
        (project_id,),
    )


def fetch_project_phase(session: DatabaseSession, project_id: UUID, phase_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT *
        FROM phases
        WHERE id = %s
          AND project_id = %s
          AND archived_at IS NULL
        """,
        (phase_id, project_id),
    )


def fetch_project_phase_or_404(session: DatabaseSession, project_id: UUID, phase_id: UUID) -> Row:
    phase = fetch_project_phase(session, project_id, phase_id)
    if phase is None:
        raise_phase_not_found()
    return phase


def ensure_phase_in_project(session: DatabaseSession, project_id: UUID, phase_id: UUID) -> None:
    if fetch_project_phase(session, project_id, phase_id) is None:
        raise_phase_not_found()


def ensure_project_lead(session: DatabaseSession, user_id: UUID, project_id: UUID) -> None:
    row = session.fetch_one(
        """
        SELECT project_lead_id
        FROM projects
        WHERE id = %s
          AND archived_at IS NULL
        """,
        (project_id,),
    )
    if row is None:
        raise_project_not_found()
    if row["project_lead_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PROJECT_LEAD_REQUIRED_DETAIL,
        )


def project_to_response(row: Row) -> ProjectResponse:
    return ProjectResponse(**row)


def project_member_to_response(row: Row) -> ProjectMemberResponse:
    return ProjectMemberResponse(**row)


def phase_to_response(row: Row) -> PhaseResponse:
    return PhaseResponse(**row)


def dashboard_project_to_response(row: Row) -> DashboardProjectResponse:
    return DashboardProjectResponse(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        description=row["description"],
        project_lead=ProjectLeadResponse(
            id=row["project_lead_id"],
            name=row["project_lead_name"],
            email=row["project_lead_email"],
        ),
        status=row["status"],
        health=row["health"],
        health_color=row["health_color"],
        overall_progress=row["overall_progress"],
        current_phase_id=row["current_phase_id"],
        start_date=row["start_date"],
        end_date=row["end_date"],
        priority=row["priority"],
        archived_at=row["archived_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def dashboard_phase_to_response(row: Row) -> DashboardPhaseResponse:
    return DashboardPhaseResponse(**row)


def raise_project_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROJECT_NOT_FOUND_DETAIL)


def raise_phase_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PHASE_NOT_FOUND_DETAIL)
