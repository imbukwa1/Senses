from datetime import date, datetime
from decimal import Decimal
import logging
import re
from urllib.parse import quote
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from app.access import (
    ensure_project_access,
    ensure_project_pm,
    fetch_accessible_project,
    fetch_accessible_projects,
    fetch_project_member_role,
)
from app.auth import AuthenticatedUser, get_current_user
from app.db import DatabaseSession, Row
from app.dependencies import get_authenticated_db_session
from app.storage import FileStorage, FileStorageError


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])

ProjectStatus = Literal["Planning", "Not Started", "Active", "On Hold", "Completed"]
PhaseStatus = Literal["Not Started", "In Progress", "Completed"]
TaskStatus = Literal["Not Started", "In Progress", "Blocked", "Completed"]
PriorityLevel = Literal["Low", "Medium", "High"]
ProjectMemberRole = Literal["PM", "Team Member", "Finance"]
TaskFileCategory = Literal["reference", "work_submission"]
UserFacingProjectHealth = Literal["On track", "Needs attention", "At risk", "Completed"]

PROJECT_NOT_FOUND_DETAIL = "Project not found"
PHASE_NOT_FOUND_DETAIL = "Phase not found"
TASK_NOT_FOUND_DETAIL = "Task not found"
DELIVERABLE_NOT_FOUND_DETAIL = "Checklist item not found"
TASK_FILE_NOT_FOUND_DETAIL = "Task file not found"
FILE_STORAGE_NOT_CONFIGURED_DETAIL = "File storage is not configured"
FILE_UPLOAD_EMPTY_DETAIL = "Uploaded file cannot be empty"
FILE_UPLOAD_TOO_LARGE_DETAIL = "Uploaded file is too large"
TASK_FILE_UPLOAD_FORBIDDEN_DETAIL = "You cannot upload work to this task"
TASK_SUPPORTER_EXISTS_DETAIL = "Task supporter already exists"
PHASE_MEMBER_EXISTS_DETAIL = "Phase member already exists"
PHASE_MEMBER_NOT_FOUND_DETAIL = "Phase member not found"
PHASE_MEMBER_PROJECT_MEMBER_REQUIRED_DETAIL = "Phase member must belong to the parent project"
TASK_ASSIGNEE_PROJECT_MEMBER_REQUIRED_DETAIL = "Task assignee must belong to the parent project"
USER_NOT_FOUND_DETAIL = "User not found"
PROJECT_LEAD_REQUIRED_DETAIL = "Project lead is required to change project status"
PROJECT_LEAD_MEMBER_REMOVE_DETAIL = "Project lead cannot be removed from project members"
LAST_PROJECT_PM_REMOVE_DETAIL = "The last project PM cannot be removed"
PROJECT_MEMBER_HAS_PHASES_DETAIL = "Project member is assigned to one or more phases"
PROJECT_BUDGET_ROLE_REQUIRED_DETAIL = "Project PM or Finance role is required"
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
REQUIRED_TASK_FIELDS = {
    "name",
    "owner_id",
    "priority",
    "status",
}
REQUIRED_DELIVERABLE_FIELDS = {
    "description",
    "is_completed",
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


class ProjectBudgetUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allocated: Decimal | None = None
    spent: Decimal | None = None


class UserSummaryResponse(BaseModel):
    id: UUID
    name: str
    email: str


class ProjectResponse(BaseModel):
    id: UUID
    code: str
    name: str
    description: str
    project_lead_id: UUID
    project_lead: UserSummaryResponse
    current_phase_id: UUID | None
    start_date: date
    end_date: date
    status: str
    health: str
    health_color: str
    health_label: UserFacingProjectHealth
    health_reasons: list[str]
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
    role: ProjectMemberRole = "Team Member"


class ProjectMemberUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: ProjectMemberRole


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
    owner: UserSummaryResponse | None
    start_date: date | None
    end_date: date | None
    status: str
    display_order: int
    objectives: str | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class TaskCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    owner_id: UUID
    priority: PriorityLevel = "Medium"
    status: TaskStatus = "Not Started"
    start_date: date | None = None
    due_date: date | None = None


class TaskUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    owner_id: UUID | None = None
    priority: PriorityLevel | None = None
    status: TaskStatus | None = None
    start_date: date | None = None
    due_date: date | None = None


class TaskStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: TaskStatus


class TaskSupporterCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID


class PhaseMemberCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID


class TaskResponse(BaseModel):
    id: UUID
    project_id: UUID
    phase_id: UUID
    name: str
    description: str | None
    owner_id: UUID
    owner: UserSummaryResponse
    priority: str
    status: str
    start_date: date | None
    due_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TaskSupporterResponse(BaseModel):
    task_id: UUID
    user_id: UUID
    name: str
    email: str
    added_at: datetime


class PhaseMemberResponse(BaseModel):
    phase_id: UUID
    user_id: UUID
    name: str
    email: str
    added_at: datetime


class ChecklistItemCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=1)
    is_completed: bool = False
    display_order: int = Field(gt=0)


class ChecklistItemUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str | None = Field(default=None, min_length=1)
    is_completed: bool | None = None
    display_order: int | None = Field(default=None, gt=0)


class ChecklistItemCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_completed: bool


class ChecklistSummaryResponse(BaseModel):
    completed_items: int
    total_items: int
    progress: Decimal


class ChecklistItemResponse(BaseModel):
    id: UUID
    task_id: UUID
    description: str
    is_completed: bool
    display_order: int
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ChecklistResponse(BaseModel):
    task_id: UUID
    summary: ChecklistSummaryResponse
    items: list[ChecklistItemResponse]


class TaskCommentCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    comment: str = Field(min_length=1)


class TaskCommentResponse(BaseModel):
    id: UUID
    task_id: UUID
    user_id: UUID
    author_name: str
    author_email: str
    comment: str
    created_at: datetime
    updated_at: datetime


class TaskFileResponse(BaseModel):
    id: UUID
    task_id: UUID
    uploaded_by: UUID
    uploader_name: str
    uploader_email: str
    file_name: str
    file_type: str | None
    file_size: int
    file_category: str
    created_at: datetime


class ProjectMemberResponse(BaseModel):
    project_id: UUID
    user_id: UUID
    name: str
    email: str
    role: str
    joined_at: datetime


class ProjectBudgetResponse(BaseModel):
    project_id: UUID
    allocated: Decimal
    spent: Decimal
    remaining: Decimal
    utilisation: Decimal


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
    health_label: UserFacingProjectHealth
    health_reasons: list[str]
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
    owner: UserSummaryResponse | None
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
        INSERT INTO project_members (project_id, user_id, role)
        VALUES (%s, %s, %s)
        ON CONFLICT DO NOTHING
        """,
        (project["id"], current_user.id, "Team Member"),
    )
    ensure_project_lead_membership(session, project["id"], payload.project_lead_id)
    return project_to_response(fetch_project_health_by_id(session, project["id"]), session, current_user.id)


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectResponse]:
    return [project_to_response(row, session, current_user.id) for row in fetch_accessible_projects(session, current_user.id)]


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectResponse:
    project = fetch_accessible_project(session, current_user.id, project_id)
    if project is None:
        raise_project_not_found()

    return project_to_response(project, session, current_user.id)


@router.get("/{project_id}/budget", response_model=ProjectBudgetResponse)
def get_project_budget(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectBudgetResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_budget_role(session, current_user.id, project_id)
    return project_budget_to_response(fetch_project_budget_or_404(session, project_id))


@router.patch("/{project_id}/budget", response_model=ProjectBudgetResponse)
def update_project_budget(
    project_id: UUID,
    payload: ProjectBudgetUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectBudgetResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_budget_role(session, current_user.id, project_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return project_budget_to_response(fetch_project_budget_or_404(session, project_id))
    null_fields = sorted(field for field, value in values.items() if value is None)
    if null_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Budget values cannot be null: {', '.join(null_fields)}",
        )
    negative_fields = sorted(field for field, value in values.items() if value is not None and value < 0)
    if negative_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Budget values cannot be negative: {', '.join(negative_fields)}",
        )

    field_map = {
        "allocated": "budget_allocated",
        "spent": "budget_spent",
    }
    set_clause = ", ".join(f"{field_map[field]} = %s" for field in values)
    params = [*values.values(), project_id]
    row = session.fetch_one(
        f"""
        UPDATE projects
        SET {set_clause}
        WHERE id = %s
          AND archived_at IS NULL
        RETURNING id
        """,
        params,
    )
    if row is None:
        raise_project_not_found()

    return project_budget_to_response(fetch_project_budget_or_404(session, project_id))


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

    phases = [
        dashboard_phase_to_response(row)
        for row in fetch_dashboard_phases(session, project_id, current_user.id)
    ]
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
        project=dashboard_project_to_response(project, session, current_user.id),
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
    return phase_to_response(fetch_project_phase_or_404(session, project_id, phase["id"]))


@router.get("/{project_id}/phases", response_model=list[PhaseResponse])
def list_phases(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[PhaseResponse]:
    ensure_project_access(session, current_user.id, project_id)
    return [phase_to_response(row) for row in fetch_project_phases(session, project_id, current_user.id)]


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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Phase IDs must be unique",
        )

    active_phase_ids = [row["id"] for row in fetch_project_phases(session, project_id)]
    if set(active_phase_ids) != set(payload.phase_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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

    return project_to_response(fetch_project_health_by_id(session, project["id"]), session, current_user.id)


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
    return phase_to_response(fetch_project_phase_or_404(session, project_id, phase["id"]))


@router.get("/{project_id}/phases/{phase_id}/members", response_model=list[PhaseMemberResponse])
def list_phase_members(
    project_id: UUID,
    phase_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[PhaseMemberResponse]:
    ensure_project_access(session, current_user.id, project_id)
    ensure_phase_in_project(session, project_id, phase_id)
    return [phase_member_to_response(row) for row in fetch_phase_members(session, phase_id)]


@router.post(
    "/{project_id}/phases/{phase_id}/members",
    response_model=PhaseMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_phase_member(
    project_id: UUID,
    phase_id: UUID,
    payload: PhaseMemberCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> PhaseMemberResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    ensure_phase_in_project(session, project_id, phase_id)
    ensure_user_exists(session, payload.user_id)
    if fetch_optional_project_member(session, project_id, payload.user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=PHASE_MEMBER_PROJECT_MEMBER_REQUIRED_DETAIL,
        )
    if fetch_phase_member(session, phase_id, payload.user_id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=PHASE_MEMBER_EXISTS_DETAIL)

    session.execute(
        "INSERT INTO phase_members (phase_id, user_id) VALUES (%s, %s)",
        (phase_id, payload.user_id),
    )
    return phase_member_to_response(fetch_phase_member_or_404(session, phase_id, payload.user_id))


@router.delete(
    "/{project_id}/phases/{phase_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_phase_member(
    project_id: UUID,
    phase_id: UUID,
    user_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    ensure_phase_in_project(session, project_id, phase_id)
    session.execute(
        "DELETE FROM phase_members WHERE phase_id = %s AND user_id = %s",
        (phase_id, user_id),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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

    return phase_to_response(fetch_project_phase_or_404(session, project_id, phase["id"]))


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

    return phase_to_response(fetch_project_phase_or_404(session, project_id, phase["id"]))


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
        WITH archived_phase AS (
          UPDATE phases
          SET archived_at = COALESCE(archived_at, NOW())
          WHERE id = %s
            AND project_id = %s
            AND archived_at IS NULL
          RETURNING *
        )
        SELECT
          archived_phase.*,
          users.name AS owner_name,
          users.email AS owner_email
        FROM archived_phase
        LEFT JOIN users ON users.id = archived_phase.owner_id
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


@router.post(
    "/{project_id}/phases/{phase_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    project_id: UUID,
    phase_id: UUID,
    payload: TaskCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> TaskResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    ensure_phase_in_project(session, project_id, phase_id)
    ensure_task_assignee_membership(session, project_id, phase_id, payload.owner_id)
    task = session.fetch_one(
        """
        INSERT INTO tasks (
          phase_id,
          name,
          description,
          owner_id,
          priority,
          status,
          start_date,
          due_date
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            phase_id,
            payload.name,
            payload.description,
            payload.owner_id,
            payload.priority,
            payload.status,
            payload.start_date,
            payload.due_date,
        ),
    )
    return task_to_response(fetch_project_task_or_404(session, project_id, phase_id, task["id"]))


@router.get("/{project_id}/phases/{phase_id}/tasks", response_model=list[TaskResponse])
def list_tasks(
    project_id: UUID,
    phase_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[TaskResponse]:
    ensure_project_access(session, current_user.id, project_id)
    ensure_phase_in_project(session, project_id, phase_id)
    return [task_to_response(row) for row in fetch_project_phase_tasks(session, project_id, phase_id)]


@router.get("/{project_id}/phases/{phase_id}/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> TaskResponse:
    ensure_project_access(session, current_user.id, project_id)
    return task_to_response(fetch_project_task_or_404(session, project_id, phase_id, task_id))


@router.patch("/{project_id}/phases/{phase_id}/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    payload: TaskUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> TaskResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return task_to_response(fetch_project_task_or_404(session, project_id, phase_id, task_id))

    null_required_fields = sorted(
        field for field in REQUIRED_TASK_FIELDS if field in values and values[field] is None
    )
    if null_required_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Required task fields cannot be null: {', '.join(null_required_fields)}",
        )
    if "owner_id" in values:
        ensure_task_assignee_membership(session, project_id, phase_id, values["owner_id"])

    set_clause = ", ".join(f"{field} = %s" for field in values)
    params = [*values.values(), task_id, phase_id]
    task = session.fetch_one(
        f"""
        UPDATE tasks
        SET {set_clause}
        WHERE id = %s
          AND phase_id = %s
        RETURNING id
        """,
        params,
    )
    if task is None:
        raise_task_not_found()

    return task_to_response(fetch_project_task_or_404(session, project_id, phase_id, task["id"]))


@router.patch("/{project_id}/phases/{phase_id}/tasks/{task_id}/status", response_model=TaskResponse)
def update_task_status(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    payload: TaskStatusUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> TaskResponse:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    task = session.fetch_one(
        """
        UPDATE tasks
        SET status = %s
        WHERE id = %s
          AND phase_id = %s
        RETURNING id
        """,
        (payload.status, task_id, phase_id),
    )
    if task is None:
        raise_task_not_found()

    return task_to_response(fetch_project_task_or_404(session, project_id, phase_id, task["id"]))


@router.get(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/supporters",
    response_model=list[TaskSupporterResponse],
)
def list_task_supporters(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[TaskSupporterResponse]:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    return [task_supporter_to_response(row) for row in fetch_task_supporters(session, task_id)]


@router.post(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/supporters",
    response_model=TaskSupporterResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_task_supporter(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    payload: TaskSupporterCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> TaskSupporterResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    ensure_task_assignee_membership(session, project_id, phase_id, payload.user_id)

    session.execute(
        """
        INSERT INTO task_supporters (task_id, user_id)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
        """,
        (task_id, payload.user_id),
    )
    return task_supporter_to_response(fetch_task_supporter_or_404(session, task_id, payload.user_id))


@router.delete(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/supporters/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_task_supporter(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    user_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    session.execute(
        "DELETE FROM task_supporters WHERE task_id = %s AND user_id = %s",
        (task_id, user_id),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/checklist",
    response_model=ChecklistItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_checklist_item(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    payload: ChecklistItemCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ChecklistItemResponse:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    item = session.fetch_one(
        """
        INSERT INTO task_deliverables (
          task_id,
          description,
          is_completed,
          display_order
        )
        VALUES (%s, %s, %s, %s)
        RETURNING *
        """,
        (task_id, payload.description, payload.is_completed, payload.display_order),
    )
    return checklist_item_to_response(item)


@router.get(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/checklist",
    response_model=ChecklistResponse,
)
def list_checklist_items(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ChecklistResponse:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    return checklist_to_response(session, task_id)


@router.patch(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/checklist/{item_id}",
    response_model=ChecklistItemResponse,
)
def update_checklist_item(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    item_id: UUID,
    payload: ChecklistItemUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ChecklistItemResponse:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    fetch_checklist_item_or_404(session, task_id, item_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return checklist_item_to_response(fetch_checklist_item_or_404(session, task_id, item_id))

    null_required_fields = sorted(
        field for field in REQUIRED_DELIVERABLE_FIELDS if field in values and values[field] is None
    )
    if null_required_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Required checklist item fields cannot be null: {', '.join(null_required_fields)}",
        )

    set_clause = ", ".join(f"{field} = %s" for field in values)
    params = [*values.values(), item_id, task_id]
    item = session.fetch_one(
        f"""
        UPDATE task_deliverables
        SET {set_clause}
        WHERE id = %s
          AND task_id = %s
        RETURNING *
        """,
        params,
    )
    if item is None:
        raise_deliverable_not_found()

    return checklist_item_to_response(item)


@router.patch(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/checklist/{item_id}/completion",
    response_model=ChecklistItemResponse,
)
def set_checklist_item_completion(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    item_id: UUID,
    payload: ChecklistItemCompletionRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ChecklistItemResponse:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    item = session.fetch_one(
        """
        UPDATE task_deliverables
        SET is_completed = %s
        WHERE id = %s
          AND task_id = %s
        RETURNING *
        """,
        (payload.is_completed, item_id, task_id),
    )
    if item is None:
        raise_deliverable_not_found()

    return checklist_item_to_response(item)


@router.delete(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/checklist/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_checklist_item(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    item_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    session.execute(
        "DELETE FROM task_deliverables WHERE id = %s AND task_id = %s",
        (item_id, task_id),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/comments",
    response_model=TaskCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task_comment(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    payload: TaskCommentCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> TaskCommentResponse:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    comment = session.fetch_one(
        """
        INSERT INTO comments (task_id, user_id, comment)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (task_id, current_user.id, payload.comment),
    )
    return task_comment_to_response(fetch_task_comment_or_404(session, task_id, comment["id"]))


@router.get(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/comments",
    response_model=list[TaskCommentResponse],
)
def list_task_comments(
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[TaskCommentResponse]:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    return [task_comment_to_response(row) for row in fetch_task_comments(session, task_id)]


@router.post(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/files",
    response_model=TaskFileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_task_file(
    request: Request,
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    file_category: TaskFileCategory = Form("work_submission"),
    file: UploadFile = File(...),
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> TaskFileResponse:
    with request.app.state.database.session(actor_user_id=current_user.id) as session:
        ensure_project_access(session, current_user.id, project_id)
        task = fetch_project_task_or_404(session, project_id, phase_id, task_id)
        ensure_task_file_upload_allowed(session, current_user.id, project_id, task, file_category)

    storage = get_file_storage(request)
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=FILE_UPLOAD_EMPTY_DETAIL)
    max_upload_bytes = request.app.state.settings.max_upload_bytes
    if len(content) > max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=FILE_UPLOAD_TOO_LARGE_DETAIL)

    safe_file_name = sanitize_storage_file_name(file.filename or "attachment")
    storage_key = build_task_file_storage_key(task_id, safe_file_name)

    await run_in_threadpool(storage.upload, storage_key, content, file.content_type)
    try:
        with request.app.state.database.session(actor_user_id=current_user.id) as session:
            ensure_project_access(session, current_user.id, project_id)
            task = fetch_project_task_or_404(session, project_id, phase_id, task_id)
            ensure_task_file_upload_allowed(session, current_user.id, project_id, task, file_category)
            row = session.fetch_one(
                """
                INSERT INTO task_files (
                  task_id,
                  uploaded_by,
                  file_name,
                  storage_key,
                  file_type,
                  file_size,
                  file_category
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    task_id,
                    current_user.id,
                    safe_file_name,
                    storage_key,
                    file.content_type,
                    len(content),
                    file_category,
                ),
            )
            response = task_file_to_response(fetch_task_file_or_404(session, task_id, row["id"]))
    except Exception:
        await run_in_threadpool(cleanup_uploaded_file, storage, storage_key)
        raise

    return response


@router.get(
    "/{project_id}/phases/{phase_id}/tasks/{task_id}/files",
    response_model=list[TaskFileResponse],
)
def list_task_files(
    request: Request,
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[TaskFileResponse]:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    return [task_file_to_response(row) for row in fetch_task_files(session, task_id)]


@router.get("/{project_id}/phases/{phase_id}/tasks/{task_id}/files/{file_id}/download")
def download_task_file(
    request: Request,
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
    file_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    fetch_project_task_or_404(session, project_id, phase_id, task_id)
    metadata = fetch_task_file_or_404(session, task_id, file_id)
    stored_file = get_file_storage(request).download(metadata["storage_key"])
    content_type = metadata["file_type"] or stored_file.content_type or "application/octet-stream"
    quoted_name = quote(metadata["file_name"])
    return Response(
        content=stored_file.content,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quoted_name}"},
    )


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
        return project_to_response(project, session, current_user.id)

    null_required_fields = sorted(
        field for field in REQUIRED_PROJECT_FIELDS if field in values and values[field] is None
    )
    if null_required_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Required project fields cannot be null: {', '.join(null_required_fields)}",
        )

    if "project_lead_id" in values:
        ensure_project_pm(session, current_user.id, project_id)
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

    if "project_lead_id" in values:
        ensure_project_lead_membership(session, project["id"], values["project_lead_id"])

    return project_to_response(fetch_project_health_by_id(session, project["id"]), session, current_user.id)


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

    return project_to_response(fetch_project_health_by_id(session, project["id"]), session, current_user.id)


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

    return project_to_response(fetch_project_health_by_id(session, project["id"]), session, current_user.id)


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
          project_members.role,
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
    ensure_project_pm(session, current_user.id, project_id)
    ensure_user_exists(session, payload.user_id)
    ensure_project_member_role_assignment_allowed(session, project_id, payload.user_id, payload.role)
    session.execute(
        """
        INSERT INTO project_members (project_id, user_id, role)
        VALUES (%s, %s, %s)
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET role = EXCLUDED.role
        """,
        (project_id, payload.user_id, payload.role),
    )
    member = fetch_project_member(session, project_id, payload.user_id)
    return project_member_to_response(member)


@router.patch("/{project_id}/members/{user_id}", response_model=ProjectMemberResponse)
def update_project_member(
    project_id: UUID,
    user_id: UUID,
    payload: ProjectMemberUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectMemberResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    ensure_member_role_change_allowed(session, project_id, user_id, payload.role)
    row = session.fetch_one(
        """
        UPDATE project_members
        SET role = %s
        WHERE project_id = %s
          AND user_id = %s
        RETURNING project_id
        """,
        (payload.role, project_id, user_id),
    )
    if row is None:
        raise_project_not_found()

    return project_member_to_response(fetch_project_member(session, project_id, user_id))


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_member(
    project_id: UUID,
    user_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    ensure_project_member_removal_allowed(session, project_id, user_id)
    session.execute(
        "DELETE FROM project_members WHERE project_id = %s AND user_id = %s",
        (project_id, user_id),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def ensure_user_exists(session: DatabaseSession, user_id: UUID) -> None:
    row = session.fetch_one("SELECT id FROM users WHERE id = %s", (user_id,))
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=USER_NOT_FOUND_DETAIL)


def ensure_task_assignee_membership(
    session: DatabaseSession,
    project_id: UUID,
    phase_id: UUID,
    user_id: UUID,
) -> None:
    ensure_user_exists(session, user_id)
    if fetch_optional_project_member(session, project_id, user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=TASK_ASSIGNEE_PROJECT_MEMBER_REQUIRED_DETAIL,
        )

    session.execute(
        """
        INSERT INTO phase_members (phase_id, user_id)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
        """,
        (phase_id, user_id),
    )

    if fetch_phase_member(session, phase_id, user_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=PHASE_MEMBER_PROJECT_MEMBER_REQUIRED_DETAIL,
        )


def ensure_project_lead_membership(
    session: DatabaseSession,
    project_id: UUID,
    lead_user_id: UUID,
) -> None:
    session.execute(
        """
        INSERT INTO project_members (project_id, user_id, role)
        VALUES (%s, %s, 'PM')
        ON CONFLICT (project_id, user_id)
        DO UPDATE SET role = 'PM'
        """,
        (project_id, lead_user_id),
    )


def ensure_project_member_removal_allowed(
    session: DatabaseSession,
    project_id: UUID,
    user_id: UUID,
) -> None:
    project = session.fetch_one(
        """
        SELECT project_lead_id
        FROM projects
        WHERE id = %s
          AND archived_at IS NULL
        """,
        (project_id,),
    )
    if project is None:
        raise_project_not_found()
    if project["project_lead_id"] == user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=PROJECT_LEAD_MEMBER_REMOVE_DETAIL,
        )
    if project_member_has_phase_memberships(session, project_id, user_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=PROJECT_MEMBER_HAS_PHASES_DETAIL,
        )

    member = fetch_project_member(session, project_id, user_id)
    if member["role"] == "PM" and count_project_pms(session, project_id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=LAST_PROJECT_PM_REMOVE_DETAIL,
        )


def ensure_member_role_change_allowed(
    session: DatabaseSession,
    project_id: UUID,
    user_id: UUID,
    next_role: ProjectMemberRole,
) -> None:
    project = session.fetch_one(
        """
        SELECT project_lead_id
        FROM projects
        WHERE id = %s
          AND archived_at IS NULL
        """,
        (project_id,),
    )
    if project is None:
        raise_project_not_found()
    if project["project_lead_id"] == user_id and next_role != "PM":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project lead must remain a PM",
        )

    member = fetch_project_member(session, project_id, user_id)
    if member["role"] == "PM" and next_role != "PM" and count_project_pms(session, project_id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=LAST_PROJECT_PM_REMOVE_DETAIL,
        )


def ensure_project_member_role_assignment_allowed(
    session: DatabaseSession,
    project_id: UUID,
    user_id: UUID,
    next_role: ProjectMemberRole,
) -> None:
    existing_member = fetch_optional_project_member(session, project_id, user_id)
    if existing_member is not None:
        ensure_member_role_change_allowed(session, project_id, user_id, next_role)
        return

    project = session.fetch_one(
        """
        SELECT project_lead_id
        FROM projects
        WHERE id = %s
          AND archived_at IS NULL
        """,
        (project_id,),
    )
    if project is None:
        raise_project_not_found()
    if project["project_lead_id"] == user_id and next_role != "PM":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project lead must remain a PM",
        )


def count_project_pms(session: DatabaseSession, project_id: UUID) -> int:
    row = session.fetch_one(
        """
        SELECT COUNT(*) AS pm_count
        FROM project_members
        WHERE project_id = %s
          AND role = 'PM'
        """,
        (project_id,),
    )
    return int(row["pm_count"])


def project_member_has_phase_memberships(session: DatabaseSession, project_id: UUID, user_id: UUID) -> bool:
    row = session.fetch_one(
        """
        SELECT EXISTS (
          SELECT 1
          FROM phase_members
          JOIN phases
            ON phases.id = phase_members.phase_id
          WHERE phases.project_id = %s
            AND phase_members.user_id = %s
        ) AS has_phase_memberships
        """,
        (project_id, user_id),
    )
    return bool(row["has_phase_memberships"])


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
          project_members.role,
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


def fetch_optional_project_member(
    session: DatabaseSession,
    project_id: UUID,
    user_id: UUID,
) -> Row | None:
    return session.fetch_one(
        """
        SELECT
          project_members.project_id,
          users.id AS user_id,
          users.name,
          users.email,
          project_members.role,
          project_members.joined_at
        FROM project_members
        JOIN users ON users.id = project_members.user_id
        WHERE project_members.project_id = %s
          AND project_members.user_id = %s
        """,
        (project_id, user_id),
    )


def fetch_project_health_by_id(session: DatabaseSession, project_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          project_health.*,
          users.name AS project_lead_name,
          users.email AS project_lead_email
        FROM project_health
        JOIN users ON users.id = project_health.project_lead_id
        WHERE project_health.id = %s
        """,
        (project_id,),
    )
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


def fetch_dashboard_phases(session: DatabaseSession, project_id: UUID, user_id: UUID | None = None) -> list[Row]:
    visibility_clause = ""
    params: tuple = (project_id,)
    if user_id is not None and fetch_project_member_role(session, user_id, project_id) != "PM":
        visibility_clause = """
          AND EXISTS (
            SELECT 1
            FROM phase_members
            WHERE phase_members.phase_id = phases.id
              AND phase_members.user_id = %s
          )
        """
        params = (project_id, user_id)

    return session.fetch_all(
        f"""
        SELECT
          phases.id,
          phases.project_id,
          phases.name,
          phases.description,
          phases.owner_id,
          users.name AS owner_name,
          users.email AS owner_email,
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
        LEFT JOIN users ON users.id = phases.owner_id
        LEFT JOIN tasks
          ON tasks.phase_id = phases.id
        LEFT JOIN task_progress
          ON task_progress.task_id = tasks.id
        WHERE phases.project_id = %s
          AND phases.archived_at IS NULL
          {visibility_clause}
        GROUP BY phases.id, users.name, users.email
        ORDER BY phases.display_order, phases.created_at, phases.id
        """,
        params,
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


def fetch_project_phases(session: DatabaseSession, project_id: UUID, user_id: UUID | None = None) -> list[Row]:
    visibility_clause = ""
    params: tuple = (project_id,)
    if user_id is not None and fetch_project_member_role(session, user_id, project_id) != "PM":
        visibility_clause = """
          AND EXISTS (
            SELECT 1
            FROM phase_members
            WHERE phase_members.phase_id = phases.id
              AND phase_members.user_id = %s
          )
        """
        params = (project_id, user_id)

    return session.fetch_all(
        f"""
        SELECT
          phases.*,
          users.name AS owner_name,
          users.email AS owner_email
        FROM phases
        LEFT JOIN users ON users.id = phases.owner_id
        WHERE phases.project_id = %s
          AND phases.archived_at IS NULL
          {visibility_clause}
        ORDER BY phases.display_order, phases.created_at, phases.id
        """,
        params,
    )


def fetch_project_phase(session: DatabaseSession, project_id: UUID, phase_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT
          phases.*,
          users.name AS owner_name,
          users.email AS owner_email
        FROM phases
        LEFT JOIN users ON users.id = phases.owner_id
        WHERE phases.id = %s
          AND phases.project_id = %s
          AND phases.archived_at IS NULL
        """,
        (phase_id, project_id),
    )


def fetch_project_phase_or_404(session: DatabaseSession, project_id: UUID, phase_id: UUID) -> Row:
    phase = fetch_project_phase(session, project_id, phase_id)
    if phase is None:
        raise_phase_not_found()
    return phase


def fetch_project_phase_tasks(session: DatabaseSession, project_id: UUID, phase_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          tasks.id,
          phases.project_id,
          tasks.phase_id,
          tasks.name,
          tasks.description,
          tasks.owner_id,
          users.name AS owner_name,
          users.email AS owner_email,
          tasks.priority,
          tasks.status,
          tasks.start_date,
          tasks.due_date,
          tasks.completed_at,
          tasks.created_at,
          tasks.updated_at
        FROM tasks
        JOIN phases ON phases.id = tasks.phase_id
        JOIN users ON users.id = tasks.owner_id
        WHERE phases.project_id = %s
          AND phases.id = %s
          AND phases.archived_at IS NULL
        ORDER BY tasks.created_at, tasks.id
        """,
        (project_id, phase_id),
    )


def fetch_project_task(
    session: DatabaseSession,
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
) -> Row | None:
    return session.fetch_one(
        """
        SELECT
          tasks.id,
          phases.project_id,
          tasks.phase_id,
          tasks.name,
          tasks.description,
          tasks.owner_id,
          users.name AS owner_name,
          users.email AS owner_email,
          tasks.priority,
          tasks.status,
          tasks.start_date,
          tasks.due_date,
          tasks.completed_at,
          tasks.created_at,
          tasks.updated_at
        FROM tasks
        JOIN phases ON phases.id = tasks.phase_id
        JOIN users ON users.id = tasks.owner_id
        WHERE tasks.id = %s
          AND tasks.phase_id = %s
          AND phases.project_id = %s
          AND phases.archived_at IS NULL
        """,
        (task_id, phase_id, project_id),
    )


def fetch_project_task_or_404(
    session: DatabaseSession,
    project_id: UUID,
    phase_id: UUID,
    task_id: UUID,
) -> Row:
    task = fetch_project_task(session, project_id, phase_id, task_id)
    if task is None:
        raise_task_not_found()
    return task


def fetch_phase_members(session: DatabaseSession, phase_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          phase_members.phase_id,
          users.id AS user_id,
          users.name,
          users.email,
          phase_members.added_at
        FROM phase_members
        JOIN users ON users.id = phase_members.user_id
        WHERE phase_members.phase_id = %s
        ORDER BY phase_members.added_at, users.name, users.id
        """,
        (phase_id,),
    )


def fetch_phase_member(session: DatabaseSession, phase_id: UUID, user_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT
          phase_members.phase_id,
          users.id AS user_id,
          users.name,
          users.email,
          phase_members.added_at
        FROM phase_members
        JOIN users ON users.id = phase_members.user_id
        WHERE phase_members.phase_id = %s
          AND phase_members.user_id = %s
        """,
        (phase_id, user_id),
    )


def fetch_phase_member_or_404(session: DatabaseSession, phase_id: UUID, user_id: UUID) -> Row:
    member = fetch_phase_member(session, phase_id, user_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PHASE_MEMBER_NOT_FOUND_DETAIL)
    return member


def fetch_task_supporters(session: DatabaseSession, task_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          task_supporters.task_id,
          users.id AS user_id,
          users.name,
          users.email,
          task_supporters.added_at
        FROM task_supporters
        JOIN users ON users.id = task_supporters.user_id
        WHERE task_supporters.task_id = %s
        ORDER BY task_supporters.added_at, users.name, users.id
        """,
        (task_id,),
    )


def fetch_task_supporter(session: DatabaseSession, task_id: UUID, user_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT
          task_supporters.task_id,
          users.id AS user_id,
          users.name,
          users.email,
          task_supporters.added_at
        FROM task_supporters
        JOIN users ON users.id = task_supporters.user_id
        WHERE task_supporters.task_id = %s
          AND task_supporters.user_id = %s
        """,
        (task_id, user_id),
    )


def fetch_task_supporter_or_404(session: DatabaseSession, task_id: UUID, user_id: UUID) -> Row:
    supporter = fetch_task_supporter(session, task_id, user_id)
    if supporter is None:
        raise_task_not_found()
    return supporter


def fetch_checklist_items(session: DatabaseSession, task_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT *
        FROM task_deliverables
        WHERE task_id = %s
        ORDER BY display_order, created_at, id
        """,
        (task_id,),
    )


def fetch_checklist_item(session: DatabaseSession, task_id: UUID, item_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT *
        FROM task_deliverables
        WHERE id = %s
          AND task_id = %s
        """,
        (item_id, task_id),
    )


def fetch_checklist_item_or_404(session: DatabaseSession, task_id: UUID, item_id: UUID) -> Row:
    item = fetch_checklist_item(session, task_id, item_id)
    if item is None:
        raise_deliverable_not_found()
    return item


def fetch_checklist_summary(session: DatabaseSession, task_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          task_deliverable_counts.task_id,
          task_deliverable_counts.completed_items,
          task_deliverable_counts.total_items,
          task_progress.progress
        FROM task_deliverable_counts
        JOIN task_progress ON task_progress.task_id = task_deliverable_counts.task_id
        WHERE task_deliverable_counts.task_id = %s
        """,
        (task_id,),
    )
    if row is None:
        raise_task_not_found()
    return row


def fetch_task_comments(session: DatabaseSession, task_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          comments.id,
          comments.task_id,
          comments.user_id,
          users.name AS author_name,
          users.email AS author_email,
          comments.comment,
          comments.created_at,
          comments.updated_at
        FROM comments
        JOIN users ON users.id = comments.user_id
        WHERE comments.task_id = %s
        ORDER BY comments.created_at, comments.id
        """,
        (task_id,),
    )


def fetch_task_comment(session: DatabaseSession, task_id: UUID, comment_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT
          comments.id,
          comments.task_id,
          comments.user_id,
          users.name AS author_name,
          users.email AS author_email,
          comments.comment,
          comments.created_at,
          comments.updated_at
        FROM comments
        JOIN users ON users.id = comments.user_id
        WHERE comments.task_id = %s
          AND comments.id = %s
        """,
        (task_id, comment_id),
    )


def fetch_task_comment_or_404(session: DatabaseSession, task_id: UUID, comment_id: UUID) -> Row:
    comment = fetch_task_comment(session, task_id, comment_id)
    if comment is None:
        raise_task_not_found()
    return comment


def fetch_task_files(session: DatabaseSession, task_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          task_files.id,
          task_files.task_id,
          task_files.uploaded_by,
          users.name AS uploader_name,
          users.email AS uploader_email,
          task_files.file_name,
          task_files.storage_key,
          task_files.file_type,
          task_files.file_size,
          task_files.file_category,
          task_files.created_at
        FROM task_files
        JOIN users ON users.id = task_files.uploaded_by
        WHERE task_files.task_id = %s
        ORDER BY task_files.created_at, task_files.id
        """,
        (task_id,),
    )


def fetch_task_file(session: DatabaseSession, task_id: UUID, file_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT
          task_files.id,
          task_files.task_id,
          task_files.uploaded_by,
          users.name AS uploader_name,
          users.email AS uploader_email,
          task_files.file_name,
          task_files.storage_key,
          task_files.file_type,
          task_files.file_size,
          task_files.file_category,
          task_files.created_at
        FROM task_files
        JOIN users ON users.id = task_files.uploaded_by
        WHERE task_files.task_id = %s
          AND task_files.id = %s
        """,
        (task_id, file_id),
    )


def fetch_task_file_or_404(session: DatabaseSession, task_id: UUID, file_id: UUID) -> Row:
    file_metadata = fetch_task_file(session, task_id, file_id)
    if file_metadata is None:
        raise_task_file_not_found()
    return file_metadata


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


def ensure_project_budget_role(session: DatabaseSession, user_id: UUID, project_id: UUID) -> None:
    if fetch_project_member_role(session, user_id, project_id) not in {"PM", "Finance"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PROJECT_BUDGET_ROLE_REQUIRED_DETAIL,
        )


def ensure_task_file_upload_allowed(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
    task: Row,
    file_category: TaskFileCategory,
) -> None:
    if fetch_project_member_role(session, user_id, project_id) == "PM":
        return
    if file_category == "work_submission" and (
        task["owner_id"] == user_id or fetch_task_supporter(session, task["id"], user_id) is not None
    ):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=TASK_FILE_UPLOAD_FORBIDDEN_DETAIL,
    )


def fetch_project_budget_or_404(session: DatabaseSession, project_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          id AS project_id,
          budget_allocated AS allocated,
          budget_spent AS spent,
          budget_allocated - budget_spent AS remaining,
          CASE
            WHEN budget_allocated > 0 THEN budget_spent / budget_allocated
            ELSE 0
          END AS utilisation
        FROM projects
        WHERE id = %s
          AND archived_at IS NULL
        """,
        (project_id,),
    )
    if row is None:
        raise_project_not_found()
    return row


def project_to_response(row: Row, session: DatabaseSession | None = None, user_id: UUID | None = None) -> ProjectResponse:
    health_label, health_reasons = project_health_display(row, session, user_id)
    return ProjectResponse(
        **row,
        project_lead=UserSummaryResponse(
            id=row["project_lead_id"],
            name=row["project_lead_name"],
            email=row["project_lead_email"],
        ),
        health_label=health_label,
        health_reasons=health_reasons,
    )


def project_member_to_response(row: Row) -> ProjectMemberResponse:
    return ProjectMemberResponse(**row)


def project_budget_to_response(row: Row) -> ProjectBudgetResponse:
    return ProjectBudgetResponse(**row)


def project_health_display(row: Row, session: DatabaseSession | None = None, user_id: UUID | None = None) -> tuple[UserFacingProjectHealth, list[str]]:
    internal_health = row["health"]
    project_status = row["status"]

    if project_status == "Completed" or internal_health == "Completed":
        return "Completed", []

    reasons = fetch_project_health_reasons(session, row["id"], user_id) if session is not None else []
    serious_reasons = [reason["reason"] for reason in reasons if reason["severity"] == "At risk"]
    moderate_reasons = [reason["reason"] for reason in reasons if reason["severity"] == "Needs attention"]

    if serious_reasons:
        return "At risk", serious_reasons + moderate_reasons

    if moderate_reasons:
        return "Needs attention", moderate_reasons

    if internal_health == "Delayed":
        return "At risk", ["Project deadline has passed"]

    if internal_health == "At Risk":
        return "Needs attention", ["Project needs attention"]

    return "On track", []


def fetch_project_health_reasons(session: DatabaseSession | None, project_id: UUID, user_id: UUID | None = None) -> list[Row]:
    if session is None:
        return []

    return session.fetch_all(
        """
        WITH overdue_tasks AS (
          SELECT COUNT(*) AS count
          FROM tasks
          JOIN phases ON phases.id = tasks.phase_id
          WHERE phases.project_id = %(project_id)s
            AND phases.archived_at IS NULL
            AND tasks.due_date < CURRENT_DATE
            AND tasks.status <> 'Completed'
        ),
        blocked_tasks AS (
          SELECT COUNT(*) AS count, MIN(tasks.name) AS first_name
          FROM tasks
          JOIN phases ON phases.id = tasks.phase_id
          WHERE phases.project_id = %(project_id)s
            AND phases.archived_at IS NULL
            AND tasks.status = 'Blocked'
        ),
        delayed_phases AS (
          SELECT COUNT(*) AS count, MIN(phases.name) AS first_name
          FROM phases
          WHERE phases.project_id = %(project_id)s
            AND phases.archived_at IS NULL
            AND phases.end_date < CURRENT_DATE
            AND phases.status <> 'Completed'
        ),
        project_budget AS (
          SELECT budget_allocated, budget_spent
          FROM projects
          WHERE id = %(project_id)s
            AND archived_at IS NULL
        ),
        project_deadline AS (
          SELECT end_date, status
          FROM projects
          WHERE id = %(project_id)s
            AND archived_at IS NULL
        )
        SELECT 'Project deadline has passed' AS reason, 'At risk' AS severity, 0 AS sort_order
        FROM project_deadline
        WHERE end_date < CURRENT_DATE
          AND status <> 'Completed'
        UNION ALL
        SELECT
          CASE
            WHEN count = 1 THEN first_name || ' is behind schedule'
            ELSE count || ' phases are behind schedule'
          END AS reason,
          'At risk' AS severity,
          1 AS sort_order
        FROM delayed_phases
        WHERE count > 0
        UNION ALL
        SELECT
          CASE
            WHEN count = 1 THEN '1 task is overdue'
            ELSE count || ' tasks are overdue'
          END AS reason,
          'At risk' AS severity,
          2 AS sort_order
        FROM overdue_tasks
        WHERE count > 0
        UNION ALL
        SELECT
          CASE
            WHEN count = 1 THEN first_name || ' is blocked'
            ELSE count || ' tasks are blocked'
          END AS reason,
          'Needs attention' AS severity,
          3 AS sort_order
        FROM blocked_tasks
        WHERE count > 0
        UNION ALL
        SELECT 'Project budget is over allocated amount' AS reason, 'Needs attention' AS severity, 4 AS sort_order
        FROM project_budget
        WHERE budget_allocated > 0
          AND budget_spent > budget_allocated
          AND EXISTS (
            SELECT 1
            FROM projects
            LEFT JOIN project_members
              ON project_members.project_id = projects.id
             AND project_members.user_id = %(user_id)s
            WHERE projects.id = %(project_id)s
              AND (
                projects.project_lead_id = %(user_id)s
                OR project_members.role IN ('PM', 'Finance')
              )
          )
        ORDER BY sort_order
        """,
        {"project_id": project_id, "user_id": user_id},
    )


def phase_to_response(row: Row) -> PhaseResponse:
    return PhaseResponse(
        **row,
        owner=user_summary_from_row(row, "owner"),
    )


def task_to_response(row: Row) -> TaskResponse:
    return TaskResponse(
        **row,
        owner=user_summary_from_row(row, "owner"),
    )


def task_supporter_to_response(row: Row) -> TaskSupporterResponse:
    return TaskSupporterResponse(**row)


def phase_member_to_response(row: Row) -> PhaseMemberResponse:
    return PhaseMemberResponse(**row)


def checklist_item_to_response(row: Row) -> ChecklistItemResponse:
    return ChecklistItemResponse(**row)


def checklist_to_response(session: DatabaseSession, task_id: UUID) -> ChecklistResponse:
    summary = fetch_checklist_summary(session, task_id)
    return ChecklistResponse(
        task_id=task_id,
        summary=ChecklistSummaryResponse(
            completed_items=summary["completed_items"],
            total_items=summary["total_items"],
            progress=summary["progress"],
        ),
        items=[checklist_item_to_response(row) for row in fetch_checklist_items(session, task_id)],
    )


def task_comment_to_response(row: Row) -> TaskCommentResponse:
    return TaskCommentResponse(**row)


def task_file_to_response(row: Row) -> TaskFileResponse:
    return TaskFileResponse(**row)


def dashboard_project_to_response(row: Row, session: DatabaseSession | None = None, user_id: UUID | None = None) -> DashboardProjectResponse:
    health_label, health_reasons = project_health_display(row, session, user_id)
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
        health_label=health_label,
        health_reasons=health_reasons,
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
    return DashboardPhaseResponse(
        **row,
        owner=user_summary_from_row(row, "owner"),
    )


def user_summary_from_row(row: Row, prefix: str) -> UserSummaryResponse | None:
    user_id = row.get(f"{prefix}_id")
    if user_id is None:
        return None

    return UserSummaryResponse(
        id=user_id,
        name=row[f"{prefix}_name"],
        email=row[f"{prefix}_email"],
    )


def raise_project_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PROJECT_NOT_FOUND_DETAIL)


def raise_phase_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PHASE_NOT_FOUND_DETAIL)


def raise_task_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TASK_NOT_FOUND_DETAIL)


def raise_deliverable_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=DELIVERABLE_NOT_FOUND_DETAIL)


def raise_task_file_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=TASK_FILE_NOT_FOUND_DETAIL)


def get_file_storage(request: Request) -> FileStorage:
    storage = getattr(request.app.state, "file_storage", None)
    if storage is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=FILE_STORAGE_NOT_CONFIGURED_DETAIL,
        )
    return storage


def build_task_file_storage_key(task_id: UUID, file_name: str) -> str:
    safe_name = sanitize_storage_file_name(file_name)
    return f"tasks/{task_id}/{uuid4().hex}-{safe_name}"


def sanitize_storage_file_name(file_name: str) -> str:
    name = file_name.replace("\\", "/").rsplit("/", 1)[-1].strip()
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
    return name or "attachment"


def cleanup_uploaded_file(storage: FileStorage, storage_key: str) -> None:
    try:
        storage.delete(storage_key)
    except FileStorageError:
        logger.exception("Uploaded file cleanup failed for storage key %s", storage_key)
