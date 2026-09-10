from datetime import date, datetime
from decimal import Decimal
import logging
import re
from urllib.parse import quote
from typing import Any, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field
from psycopg.types.json import Jsonb
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
TaskFileCategory = Literal["reference", "work_submission", "finance"]
SetupDocumentType = Literal[
    "Proposal",
    "Contract / Agreement",
    "Research Licence",
    "Baseline",
    "Inception",
    "Middle Health",
    "1st Draft Project Document",
    "Final Draft",
    "Other Documents",
    # Legacy metadata values remain readable after the checklist categories change.
    "Terms of Reference",
    "Baseline documents",
    "Other supporting files",
]
UserFacingProjectHealth = Literal["On track", "Needs attention", "At risk", "Completed"]
ProjectSetupSectionStatus = Literal["Complete", "In Progress", "Not Started", "Not Applicable"]
ProjectSetupMilestoneStatus = Literal["Not Started", "In Progress", "Complete"]
ProjectSetupResourceType = Literal["People", "Equipment", "Materials", "Facilities", "Technology", "Other"]
ProjectSetupRiskIssueType = Literal["Risk", "Issue"]
ProjectSetupRiskLevel = Literal["Low", "Medium", "High"]
ProjectSetupRiskStatus = Literal["Open", "In Progress", "Mitigated", "Closed"]
ProjectSetupAssumptionConstraintType = Literal["Assumption", "Constraint"]
ProjectSetupDependencyType = Literal["Internal", "External"]
ProjectSetupApprovalStatus = Literal["Required", "Pending", "Approved", "Rejected", "Not Required"]
ProjectSetupDocumentCategoryStatus = Literal["Not Started", "In Progress", "Complete", "Not Applicable"]

PROJECT_SETUP_DOCUMENT_CATEGORIES: tuple[str, ...] = (
    "Proposal", "Contract / Agreement", "Research Licence", "Baseline", "Inception",
    "Middle Health", "1st Draft Project Document", "Final Draft", "Other Documents",
)

PROJECT_SETUP_SECTIONS: tuple[tuple[str, str, bool], ...] = (
    ("project_overview", "Project Overview", False),
    ("scope", "Scope", False),
    ("objectives_outcomes", "Objectives & Outcomes", False),
    ("work_plan", "Work Plan", False),
    ("phases", "Phases", False),
    ("milestones", "Milestones", True),
    ("deliverables", "Deliverables", True),
    ("people_governance", "People & Governance", False),
    ("stakeholders", "Stakeholders", True),
    ("resources", "Resources", True),
    ("budget_setup", "Budget Setup", True),
    ("risks_issues", "Risks & Issues", True),
    ("assumptions_constraints", "Assumptions & Constraints", True),
    ("dependencies", "Dependencies", True),
    ("communication_plan", "Communication Plan", True),
    ("approvals_signoff", "Approvals & Sign-Off", True),
    ("monitoring_reporting", "Monitoring & Reporting", True),
    ("change_management", "Change Management", True),
    ("project_specific_information", "Project-Specific Information", True),
    ("documents_attachments", "Documents & Attachments", True),
    ("notes", "Notes", True),
    ("phase0_completion", "Phase 0 Completion", False),
)
PROJECT_SETUP_SECTION_KEYS = {key for key, _label, _optional in PROJECT_SETUP_SECTIONS}
DATA_DERIVED_PROJECT_SETUP_SECTION_KEYS = {"project_overview", "scope", "objectives_outcomes", "work_plan"}

PROJECT_NOT_FOUND_DETAIL = "Project not found"
PHASE_NOT_FOUND_DETAIL = "Phase not found"
TASK_NOT_FOUND_DETAIL = "Task not found"
DELIVERABLE_NOT_FOUND_DETAIL = "Checklist item not found"
TASK_FILE_NOT_FOUND_DETAIL = "Task file not found"
WORKSPACE_FOLDER_NOT_FOUND_DETAIL = "Workspace folder not found"
WORKSPACE_DOCUMENT_NOT_FOUND_DETAIL = "Workspace document not found"
WORKSPACE_SPREADSHEET_NOT_FOUND_DETAIL = "Workspace spreadsheet not found"
FILE_STORAGE_NOT_CONFIGURED_DETAIL = "File storage is not configured"
FILE_UPLOAD_EMPTY_DETAIL = "Uploaded file cannot be empty"
FILE_UPLOAD_TOO_LARGE_DETAIL = "Uploaded file is too large"
TASK_FILE_UPLOAD_FORBIDDEN_DETAIL = "You cannot upload work to this task"
WORKSPACE_FOLDER_NAME_EXISTS_DETAIL = "A folder with that name already exists in this location"
WORKSPACE_FOLDER_NON_EMPTY_DETAIL = "Folder is not empty"
WORKSPACE_FOLDER_PARENT_SELF_DETAIL = "A folder cannot be moved into itself"
WORKSPACE_FOLDER_PARENT_DESCENDANT_DETAIL = "A folder cannot be moved into one of its subfolders"
WORKSPACE_FOLDER_NAME_INVALID_DETAIL = "Folder name is invalid"
WORKSPACE_RESOURCE_NAME_INVALID_DETAIL = "Workspace resource name is invalid"
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


class PhaseBudgetUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    allocated: Decimal | None = None
    spent: Decimal | None = None


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
    budget_allocated: Decimal
    budget_spent: Decimal
    budget_remaining: Decimal
    budget_utilisation: Decimal
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
    mentioned_user_ids: list[UUID] = Field(default_factory=list)


class TaskCommentResponse(BaseModel):
    id: UUID
    task_id: UUID
    user_id: UUID
    author_name: str
    author_email: str
    comment: str
    created_at: datetime
    updated_at: datetime
    mentioned_user_ids: list[UUID] = Field(default_factory=list)


class CommentNotificationResponse(BaseModel):
    id: UUID
    project_id: UUID
    project_name: str
    phase_id: UUID
    phase_name: str
    task_id: UUID
    task_name: str
    commenter_name: str
    comment: str
    created_at: datetime


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
    setup_document_type: str | None = None
    created_at: datetime


class ProjectFileResponse(TaskFileResponse):
    project_id: UUID
    phase_id: UUID
    phase_name: str
    task_name: str


class WorkspaceFolderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    parent_folder_id: UUID | None = None


class WorkspaceFolderUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_folder_id: UUID | None = None


class WorkspaceFileMoveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    folder_id: UUID | None = None


class WorkspaceNativeResourceCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    content: dict[str, Any]
    folder_id: UUID | None = None
    task_id: UUID | None = None


class WorkspaceNativeResourceUpdateContentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: dict[str, Any]


class WorkspaceNativeResourceRenameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)


class WorkspaceNativeResourceMoveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    folder_id: UUID | None = None


class WorkspaceNativeResourceTaskLinkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: UUID | None = None


class WorkspaceFolderResponse(BaseModel):
    id: UUID
    project_id: UUID
    parent_folder_id: UUID | None
    name: str
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class WorkspaceFileResponse(ProjectFileResponse):
    folder_id: UUID | None


class WorkspaceNativeResourceResponse(BaseModel):
    id: UUID
    project_id: UUID
    folder_id: UUID | None
    task_id: UUID | None
    name: str
    content: dict[str, Any]
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class WorkspaceDocumentResponse(WorkspaceNativeResourceResponse):
    pass


class WorkspaceSpreadsheetResponse(WorkspaceNativeResourceResponse):
    pass


class WorkspaceContentsResponse(BaseModel):
    folders: list[WorkspaceFolderResponse]
    files: list[WorkspaceFileResponse]
    documents: list[WorkspaceDocumentResponse] = Field(default_factory=list)
    spreadsheets: list[WorkspaceSpreadsheetResponse] = Field(default_factory=list)


class ProjectSetupSectionStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ProjectSetupSectionStatus


class ProjectSetupOverviewUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    start_date: date
    end_date: date
    project_location_area: str | None = Field(default=None, max_length=255)


class ProjectSetupScopeUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scope_in: str | None = None
    scope_out: str | None = None
    scope_boundaries: str | None = None
    scope_notes: str | None = None


class ProjectSetupObjectivesUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objectives: str | None = None
    expected_outcomes: str | None = None
    success_criteria: str | None = None
    key_indicators: str | None = None


class ProjectSetupWorkPlanUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    work_plan_details: str | None = None
    start_date: date
    end_date: date
    key_activities: str | None = None


class ProjectSetupWorkPlanEntryCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    details: str
    key_activities: str
    start_date: date
    end_date: date
    phase_id: UUID


class ProjectSetupWorkPlanEntryUpdateRequest(ProjectSetupWorkPlanEntryCreateRequest):
    pass


class ProjectSetupPhaseAllocationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase_id: UUID
    allocated: Decimal = Field(ge=0)


class ProjectSetupBudgetUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_project_budget: Decimal = Field(ge=0)
    budget_notes: str | None = None
    phase_allocations: list[ProjectSetupPhaseAllocationUpdateRequest] = Field(default_factory=list)


class ProjectSetupMilestoneCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    target_date: date
    responsible_user_id: UUID | None = None
    status: ProjectSetupMilestoneStatus = "Not Started"


class ProjectSetupDeliverableCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: UUID
    description: str = Field(min_length=1)
    owner_id: UUID | None = None
    due_date: date | None = None
    acceptance_criteria: str | None = None
    approver_id: UUID | None = None


class ProjectSetupResourceCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resource_type: ProjectSetupResourceType
    name: str = Field(min_length=1, max_length=200)
    notes: str | None = None


class ProjectSetupRiskIssueCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_type: ProjectSetupRiskIssueType
    title: str = Field(min_length=1, max_length=300)
    likelihood: ProjectSetupRiskLevel
    impact: ProjectSetupRiskLevel
    mitigation: str | None = None
    owner_id: UUID | None = None
    status: ProjectSetupRiskStatus = "Open"


class ProjectSetupAssumptionConstraintCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    entry_type: ProjectSetupAssumptionConstraintType
    description: str = Field(min_length=1)
    impact_notes: str | None = None


class ProjectSetupDependencyCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=1)
    dependency_type: ProjectSetupDependencyType
    related_phase_id: UUID | None = None
    related_task_id: UUID | None = None
    responsible_user_id: UUID | None = None
    responsible_party: str | None = Field(default=None, max_length=255)
    required_by_date: date | None = None


class ProjectSetupStakeholderCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255)
    organisation_group: str | None = Field(default=None, max_length=255)
    interest_role: str = Field(min_length=1)
    influence_importance: str | None = Field(default=None, max_length=100)
    engagement_notes: str | None = None


class ProjectSetupCommunicationPlanCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audience: str = Field(min_length=1)
    information: str = Field(min_length=1)
    frequency: str = Field(min_length=1, max_length=100)
    responsible_user_id: UUID | None = None
    method: str = Field(min_length=1, max_length=150)


class ProjectSetupMonitoringReportingCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    monitored_item: str = Field(min_length=1)
    reporting_frequency: str = Field(min_length=1, max_length=100)
    responsible_user_id: UUID | None = None
    key_measures: str | None = None
    reporting_notes: str | None = None


class ProjectSetupApprovalCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    required_approval: str = Field(min_length=1)
    approver_id: UUID | None = None
    due_date: date | None = None
    status: ProjectSetupApprovalStatus = "Required"
    approval_document_file_id: UUID | None = None


class ProjectSetupChangeCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    change_description: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    approved_by_id: UUID | None = None
    approved_date: date | None = None
    notes: str | None = None


class ProjectSetupSpecificInformationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1)


class ProjectSetupNoteCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str = Field(min_length=1)


class ProjectSetupDocumentCategoryStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ProjectSetupDocumentCategoryStatus


class ProjectSetupLeadResponse(BaseModel):
    id: UUID
    name: str
    email: str


class ProjectSetupOverviewResponse(BaseModel):
    name: str
    code: str
    description: str
    project_lead: ProjectSetupLeadResponse
    start_date: date
    end_date: date
    project_location_area: str | None


class ProjectSetupScopeResponse(BaseModel):
    scope_in: str | None
    scope_out: str | None
    scope_boundaries: str | None
    scope_notes: str | None


class ProjectSetupObjectivesResponse(BaseModel):
    objectives: str | None
    expected_outcomes: str | None
    success_criteria: str | None
    key_indicators: str | None


class ProjectSetupWorkPlanResponse(BaseModel):
    work_plan_details: str | None
    planned_start: date
    planned_completion: date
    key_activities: str | None
    entries: list["ProjectSetupWorkPlanEntryResponse"]


class ProjectSetupWorkPlanEntryResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    details: str
    key_activities: str
    start_date: date
    end_date: date
    phase_id: UUID
    phase_name: str
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupBudgetResponse(BaseModel):
    total_project_budget: Decimal
    budget_notes: str | None


class ProjectSetupMilestoneResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    target_date: date
    responsible_user_id: UUID | None
    responsible_person: ProjectSetupLeadResponse | None
    status: str
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupDeliverableResponse(BaseModel):
    id: UUID
    task_id: UUID
    task_name: str
    phase_id: UUID
    phase_name: str
    description: str
    owner_id: UUID | None
    owner: ProjectSetupLeadResponse | None
    due_date: date | None
    acceptance_criteria: str | None
    approver_id: UUID | None
    approver: ProjectSetupLeadResponse | None
    is_completed: bool
    display_order: int
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupResourceResponse(BaseModel):
    id: UUID
    project_id: UUID
    resource_type: str
    name: str
    notes: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupRiskIssueResponse(BaseModel):
    id: UUID
    project_id: UUID
    item_type: str
    title: str
    likelihood: str
    impact: str
    mitigation: str | None
    owner_id: UUID | None
    owner: ProjectSetupLeadResponse | None
    status: str
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupAssumptionConstraintResponse(BaseModel):
    id: UUID
    project_id: UUID
    entry_type: str
    description: str
    impact_notes: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupDependencyResponse(BaseModel):
    id: UUID
    project_id: UUID
    description: str
    dependency_type: str
    related_phase_id: UUID | None
    related_phase_name: str | None
    related_task_id: UUID | None
    related_task_name: str | None
    responsible_user_id: UUID | None
    responsible_person: ProjectSetupLeadResponse | None
    responsible_party: str | None
    required_by_date: date | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupStakeholderResponse(BaseModel):
    id: UUID
    project_id: UUID
    name: str
    organisation_group: str | None
    interest_role: str
    influence_importance: str | None
    engagement_notes: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupCommunicationPlanResponse(BaseModel):
    id: UUID
    project_id: UUID
    audience: str
    information: str
    frequency: str
    responsible_user_id: UUID | None
    responsible_person: ProjectSetupLeadResponse | None
    method: str
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupMonitoringReportingResponse(BaseModel):
    id: UUID
    project_id: UUID
    monitored_item: str
    reporting_frequency: str
    responsible_user_id: UUID | None
    responsible_person: ProjectSetupLeadResponse | None
    key_measures: str | None
    reporting_notes: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupApprovalResponse(BaseModel):
    id: UUID
    project_id: UUID
    required_approval: str
    approver_id: UUID | None
    approver: ProjectSetupLeadResponse | None
    due_date: date | None
    status: str
    approval_document_file_id: UUID | None
    approval_document_name: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupChangeResponse(BaseModel):
    id: UUID
    project_id: UUID
    change_description: str
    reason: str
    approved_by_id: UUID | None
    approved_by: ProjectSetupLeadResponse | None
    approved_date: date | None
    notes: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupSpecificInformationResponse(BaseModel):
    id: UUID
    project_id: UUID
    label: str
    value: str
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupNoteResponse(BaseModel):
    id: UUID
    project_id: UUID
    note: str
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class ProjectSetupDocumentCategoryResponse(BaseModel):
    category: str
    status: ProjectSetupDocumentCategoryStatus
    file_count: int


class ProjectSetupDetailsResponse(BaseModel):
    project_overview: ProjectSetupOverviewResponse
    scope: ProjectSetupScopeResponse
    objectives_outcomes: ProjectSetupObjectivesResponse
    work_plan: ProjectSetupWorkPlanResponse


class ProjectSetupSectionResponse(BaseModel):
    key: str
    label: str
    status: ProjectSetupSectionStatus
    optional: bool
    live_items_count: int
    live_source: str | None
    updated_by: UUID | None = None
    updated_at: datetime | None = None


class ProjectSetupSummaryResponse(BaseModel):
    complete_sections: int
    total_applicable_sections: int
    percent_complete: int


class ProjectSetupResponse(BaseModel):
    project_id: UUID
    title: str = "Project Management Plan"
    summary: ProjectSetupSummaryResponse
    sections: list[ProjectSetupSectionResponse]
    details: ProjectSetupDetailsResponse


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
    budget_allocated: Decimal
    budget_spent: Decimal
    budget_remaining: Decimal
    budget_utilisation: Decimal
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
    setup: ProjectSetupResponse


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectResponse:
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
            current_user.id,
            payload.start_date,
            payload.end_date,
            payload.status,
            payload.funder_partner,
            payload.project_type,
            payload.objectives,
            payload.priority,
        ),
    )
    ensure_project_lead_membership(session, project["id"], current_user.id)
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
    ensure_project_budget_view_role(session, current_user.id, project_id)
    return project_budget_to_response(fetch_project_budget_or_404(session, project_id))


@router.patch("/{project_id}/budget", response_model=ProjectBudgetResponse)
def update_project_budget(
    project_id: UUID,
    payload: ProjectBudgetUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectBudgetResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_budget_edit_role(session, current_user.id, project_id)
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

    field_map = {"allocated": "budget_allocated"}
    set_clause = ", ".join(f"{field_map[field]} = %s" for field in values)
    params = [*values.values(), project_id]
    row = session.fetch_one(
        f"""
        UPDATE projects
        SET {set_clause}
        WHERE projects.id = %s
          AND projects.archived_at IS NULL
        RETURNING id
        """,
        params,
    )
    if row is None:
        raise_project_not_found()

    return project_budget_to_response(fetch_project_budget_or_404(session, project_id))


@router.get("/{project_id}/files", response_model=list[ProjectFileResponse])
def list_project_files(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectFileResponse]:
    ensure_project_access(session, current_user.id, project_id)
    can_view_finance_files = project_file_finance_visible(session, current_user.id, project_id)
    return [
        project_file_to_response(row)
        for row in fetch_project_files(session, project_id, include_finance=can_view_finance_files)
    ]


@router.get("/{project_id}/files/{file_id}/download")
def download_project_file(
    request: Request,
    project_id: UUID,
    file_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    metadata = fetch_project_file_or_404(session, project_id, file_id)
    ensure_project_file_visible(session, current_user.id, project_id, metadata)
    stored_file = get_file_storage(request).download(metadata["storage_key"])
    content_type = metadata["file_type"] or stored_file.content_type or "application/octet-stream"
    quoted_name = quote(metadata["file_name"])
    return Response(
        content=stored_file.content,
        media_type=content_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quoted_name}"},
    )


@router.delete("/{project_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_file(
    request: Request,
    project_id: UUID,
    file_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    metadata = fetch_project_file_or_404(session, project_id, file_id)
    ensure_project_file_visible(session, current_user.id, project_id, metadata)
    try:
        get_file_storage(request).delete(metadata["storage_key"])
    except FileStorageError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="File could not be removed from storage") from exc
    deleted = session.fetch_one(
        "DELETE FROM task_files WHERE id = %s AND task_id = %s RETURNING id",
        (file_id, metadata["task_id"]),
    )
    if deleted is None:
        raise_task_file_not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/setup/document-categories", response_model=list[ProjectSetupDocumentCategoryResponse])
def list_project_setup_document_categories(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupDocumentCategoryResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [ProjectSetupDocumentCategoryResponse(**row) for row in fetch_project_setup_document_categories(session, project_id, current_user.id)]


@router.patch("/{project_id}/setup/document-categories/{category}", response_model=ProjectSetupDocumentCategoryResponse)
def update_project_setup_document_category(
    project_id: UUID,
    category: str,
    payload: ProjectSetupDocumentCategoryStatusRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupDocumentCategoryResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if category not in PROJECT_SETUP_DOCUMENT_CATEGORIES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project document category not found")
    if payload.status == "Not Applicable" and category != "Research Licence":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Only Research Licence can be marked Not Applicable")
    row = session.fetch_one(
        """
        INSERT INTO project_setup_document_categories (project_id, category, status, created_by)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (project_id, category) DO UPDATE SET status = EXCLUDED.status
        RETURNING category, status
        """,
        (project_id, category, payload.status, current_user.id),
    )
    category_row = fetch_project_setup_document_categories(session, project_id, current_user.id)
    return ProjectSetupDocumentCategoryResponse(**next(item for item in category_row if item["category"] == row["category"]))


@router.get("/{project_id}/workspace", response_model=WorkspaceContentsResponse)
def list_workspace_root(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceContentsResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_contents_to_response(session, current_user.id, project_id, parent_folder_id=None)


@router.get("/{project_id}/workspace/folders/{folder_id}", response_model=WorkspaceContentsResponse)
def list_workspace_folder(
    project_id: UUID,
    folder_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceContentsResponse:
    ensure_project_access(session, current_user.id, project_id)
    fetch_workspace_folder_or_404(session, project_id, folder_id)
    return workspace_contents_to_response(session, current_user.id, project_id, parent_folder_id=folder_id)


@router.post(
    "/{project_id}/workspace/folders",
    response_model=WorkspaceFolderResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_workspace_folder(
    project_id: UUID,
    payload: WorkspaceFolderCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceFolderResponse:
    ensure_project_access(session, current_user.id, project_id)
    folder_name = normalize_workspace_folder_name(payload.name)
    if payload.parent_folder_id is not None:
        fetch_workspace_folder_or_404(session, project_id, payload.parent_folder_id)
    ensure_workspace_folder_name_available(session, project_id, payload.parent_folder_id, folder_name)

    folder = session.fetch_one(
        """
        INSERT INTO workspace_folders (
          project_id,
          parent_folder_id,
          name,
          created_by
        )
        VALUES (%s, %s, %s, %s)
        RETURNING *
        """,
        (project_id, payload.parent_folder_id, folder_name, current_user.id),
    )
    return workspace_folder_to_response(folder)


@router.patch("/{project_id}/workspace/folders/{folder_id}", response_model=WorkspaceFolderResponse)
def update_workspace_folder(
    project_id: UUID,
    folder_id: UUID,
    payload: WorkspaceFolderUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceFolderResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    current_folder = fetch_workspace_folder_or_404(session, project_id, folder_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return workspace_folder_to_response(current_folder)

    next_name = (
        normalize_workspace_folder_name(values["name"])
        if "name" in values
        else current_folder["name"]
    )
    next_parent_folder_id = values.get("parent_folder_id", current_folder["parent_folder_id"])
    if next_parent_folder_id is not None:
        if next_parent_folder_id == folder_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=WORKSPACE_FOLDER_PARENT_SELF_DETAIL)
        fetch_workspace_folder_or_404(session, project_id, next_parent_folder_id)
        ensure_folder_not_moved_into_descendant(session, project_id, folder_id, next_parent_folder_id)
    ensure_workspace_folder_name_available(session, project_id, next_parent_folder_id, next_name, excluding_folder_id=folder_id)

    folder = session.fetch_one(
        """
        UPDATE workspace_folders
        SET name = %s,
            parent_folder_id = %s
        WHERE id = %s
          AND project_id = %s
        RETURNING *
        """,
        (next_name, next_parent_folder_id, folder_id, project_id),
    )
    if folder is None:
        raise_workspace_folder_not_found()
    return workspace_folder_to_response(folder)


@router.delete("/{project_id}/workspace/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace_folder(
    project_id: UUID,
    folder_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    fetch_workspace_folder_or_404(session, project_id, folder_id)
    ensure_workspace_folder_empty(session, folder_id)
    session.execute(
        """
        DELETE FROM workspace_folders
        WHERE id = %s
          AND project_id = %s
        """,
        (folder_id, project_id),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{project_id}/workspace/files/{file_id}/folder", response_model=WorkspaceFileResponse)
def move_workspace_file(
    project_id: UUID,
    file_id: UUID,
    payload: WorkspaceFileMoveRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceFileResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    metadata = fetch_project_file_or_404(session, project_id, file_id)
    ensure_project_file_visible(session, current_user.id, project_id, metadata)
    if payload.folder_id is not None:
        fetch_workspace_folder_or_404(session, project_id, payload.folder_id)

    moved = session.fetch_one(
        """
        UPDATE task_files
        SET folder_id = %s
        WHERE id = %s
        RETURNING id
        """,
        (payload.folder_id, file_id),
    )
    if moved is None:
        raise_task_file_not_found()

    return workspace_file_to_response(fetch_project_file_or_404(session, project_id, file_id))


@router.get("/{project_id}/workspace/documents", response_model=list[WorkspaceDocumentResponse])
def list_workspace_documents(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[WorkspaceDocumentResponse]:
    ensure_project_access(session, current_user.id, project_id)
    return [workspace_document_to_response(row) for row in fetch_workspace_documents(session, project_id)]


@router.get("/{project_id}/workspace/documents/{document_id}", response_model=WorkspaceDocumentResponse)
def get_workspace_document(
    project_id: UUID,
    document_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceDocumentResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_document_to_response(fetch_workspace_document_or_404(session, project_id, document_id))


@router.post(
    "/{project_id}/workspace/documents",
    response_model=WorkspaceDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_workspace_document(
    project_id: UUID,
    payload: WorkspaceNativeResourceCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceDocumentResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_document_to_response(
        create_workspace_native_resource(session, "workspace_documents", project_id, current_user.id, payload)
    )


@router.patch("/{project_id}/workspace/documents/{document_id}/content", response_model=WorkspaceDocumentResponse)
def update_workspace_document_content(
    project_id: UUID,
    document_id: UUID,
    payload: WorkspaceNativeResourceUpdateContentRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceDocumentResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_document_to_response(update_workspace_native_resource_content(session, "workspace_documents", project_id, document_id, payload.content))


@router.patch("/{project_id}/workspace/documents/{document_id}/name", response_model=WorkspaceDocumentResponse)
def rename_workspace_document(
    project_id: UUID,
    document_id: UUID,
    payload: WorkspaceNativeResourceRenameRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceDocumentResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_document_to_response(rename_workspace_native_resource(session, "workspace_documents", project_id, document_id, payload.name))


@router.patch("/{project_id}/workspace/documents/{document_id}/folder", response_model=WorkspaceDocumentResponse)
def move_workspace_document(
    project_id: UUID,
    document_id: UUID,
    payload: WorkspaceNativeResourceMoveRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceDocumentResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_document_to_response(move_workspace_native_resource(session, "workspace_documents", project_id, document_id, payload.folder_id))


@router.patch("/{project_id}/workspace/documents/{document_id}/task-link", response_model=WorkspaceDocumentResponse)
def update_workspace_document_task_link(
    project_id: UUID,
    document_id: UUID,
    payload: WorkspaceNativeResourceTaskLinkRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceDocumentResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_document_to_response(update_workspace_native_resource_task_link(session, "workspace_documents", project_id, document_id, payload.task_id))


@router.delete("/{project_id}/workspace/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace_document(
    project_id: UUID,
    document_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    delete_workspace_native_resource(session, "workspace_documents", project_id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/workspace/spreadsheets", response_model=list[WorkspaceSpreadsheetResponse])
def list_workspace_spreadsheets(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[WorkspaceSpreadsheetResponse]:
    ensure_project_access(session, current_user.id, project_id)
    return [workspace_spreadsheet_to_response(row) for row in fetch_workspace_spreadsheets(session, project_id)]


@router.get("/{project_id}/workspace/spreadsheets/{spreadsheet_id}", response_model=WorkspaceSpreadsheetResponse)
def get_workspace_spreadsheet(
    project_id: UUID,
    spreadsheet_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceSpreadsheetResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_spreadsheet_to_response(fetch_workspace_spreadsheet_or_404(session, project_id, spreadsheet_id))


@router.post(
    "/{project_id}/workspace/spreadsheets",
    response_model=WorkspaceSpreadsheetResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_workspace_spreadsheet(
    project_id: UUID,
    payload: WorkspaceNativeResourceCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceSpreadsheetResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_spreadsheet_to_response(
        create_workspace_native_resource(session, "workspace_spreadsheets", project_id, current_user.id, payload)
    )


@router.patch("/{project_id}/workspace/spreadsheets/{spreadsheet_id}/content", response_model=WorkspaceSpreadsheetResponse)
def update_workspace_spreadsheet_content(
    project_id: UUID,
    spreadsheet_id: UUID,
    payload: WorkspaceNativeResourceUpdateContentRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceSpreadsheetResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_spreadsheet_to_response(update_workspace_native_resource_content(session, "workspace_spreadsheets", project_id, spreadsheet_id, payload.content))


@router.patch("/{project_id}/workspace/spreadsheets/{spreadsheet_id}/name", response_model=WorkspaceSpreadsheetResponse)
def rename_workspace_spreadsheet(
    project_id: UUID,
    spreadsheet_id: UUID,
    payload: WorkspaceNativeResourceRenameRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceSpreadsheetResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_spreadsheet_to_response(rename_workspace_native_resource(session, "workspace_spreadsheets", project_id, spreadsheet_id, payload.name))


@router.patch("/{project_id}/workspace/spreadsheets/{spreadsheet_id}/folder", response_model=WorkspaceSpreadsheetResponse)
def move_workspace_spreadsheet(
    project_id: UUID,
    spreadsheet_id: UUID,
    payload: WorkspaceNativeResourceMoveRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceSpreadsheetResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_spreadsheet_to_response(move_workspace_native_resource(session, "workspace_spreadsheets", project_id, spreadsheet_id, payload.folder_id))


@router.patch("/{project_id}/workspace/spreadsheets/{spreadsheet_id}/task-link", response_model=WorkspaceSpreadsheetResponse)
def update_workspace_spreadsheet_task_link(
    project_id: UUID,
    spreadsheet_id: UUID,
    payload: WorkspaceNativeResourceTaskLinkRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> WorkspaceSpreadsheetResponse:
    ensure_project_access(session, current_user.id, project_id)
    return workspace_spreadsheet_to_response(update_workspace_native_resource_task_link(session, "workspace_spreadsheets", project_id, spreadsheet_id, payload.task_id))


@router.delete("/{project_id}/workspace/spreadsheets/{spreadsheet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace_spreadsheet(
    project_id: UUID,
    spreadsheet_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    delete_workspace_native_resource(session, "workspace_spreadsheets", project_id, spreadsheet_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/setup", response_model=ProjectSetupResponse)
def get_project_setup(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupResponse:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_dashboard_project(session, project_id) is None:
        raise_project_not_found()
    return build_project_setup_response(session, project_id)


@router.patch("/{project_id}/setup/sections/{section_key}", response_model=ProjectSetupResponse)
def update_project_setup_section(
    project_id: UUID,
    section_key: str,
    payload: ProjectSetupSectionStatusUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if section_key not in PROJECT_SETUP_SECTION_KEYS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project setup section not found")
    section_definition = next(section for section in PROJECT_SETUP_SECTIONS if section[0] == section_key)
    if payload.status == "Not Applicable" and not section_definition[2]:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Only optional setup sections can be marked Not Applicable")
    if section_key in DATA_DERIVED_PROJECT_SETUP_SECTION_KEYS and payload.status == "Complete":
        project = fetch_project_setup_project(session, project_id)
        if project is None:
            raise_project_not_found()
        live = fetch_project_setup_live_counts(session, project_id)
        live_status, _live_count, _live_source = project_setup_live_status(section_key, project, live, [])
        if live_status != "Complete":
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Complete the required section fields before marking it Complete")

    session.execute(
        """
        INSERT INTO project_setup_section_statuses (project_id, section_key, status, updated_by)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (project_id, section_key)
        DO UPDATE SET status = EXCLUDED.status,
                      updated_by = EXCLUDED.updated_by
        """,
        (project_id, section_key, payload.status, current_user.id),
    )
    return build_project_setup_response(session, project_id)


@router.patch("/{project_id}/setup/project-overview", response_model=ProjectSetupResponse)
def update_project_setup_overview(
    project_id: UUID,
    payload: ProjectSetupOverviewUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    name = payload.name.strip()
    description = payload.description.strip()
    if not name or not description:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Project name and purpose are required")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Project end date cannot be before the start date")
    project = fetch_project_setup_project(session, project_id)
    if project is None:
        raise_project_not_found()

    session.execute(
        """
        UPDATE projects
        SET name = %s,
            description = %s,
            start_date = %s,
            end_date = %s,
            project_location_area = %s,
            updated_at = NOW()
        WHERE projects.id = %s
          AND projects.archived_at IS NULL
        """,
        (
            name,
            description,
            payload.start_date,
            payload.end_date,
            normalize_optional_text(payload.project_location_area),
            project_id,
        ),
    )
    return build_project_setup_response(session, project_id)


@router.patch("/{project_id}/setup/scope", response_model=ProjectSetupResponse)
def update_project_setup_scope(
    project_id: UUID,
    payload: ProjectSetupScopeUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()

    session.execute(
        """
        UPDATE projects
        SET scope_in = %s,
            scope_out = %s,
            scope_boundaries = %s,
            scope_notes = %s,
            updated_at = NOW()
        WHERE projects.id = %s
          AND projects.archived_at IS NULL
        """,
        (
            normalize_optional_text(payload.scope_in),
            normalize_optional_text(payload.scope_out),
            normalize_optional_text(payload.scope_boundaries),
            normalize_optional_text(payload.scope_notes),
            project_id,
        ),
    )
    return build_project_setup_response(session, project_id)


@router.patch("/{project_id}/setup/objectives-outcomes", response_model=ProjectSetupResponse)
def update_project_setup_objectives_outcomes(
    project_id: UUID,
    payload: ProjectSetupObjectivesUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()

    session.execute(
        """
        UPDATE projects
        SET objectives = %s,
            expected_outcomes = %s,
            success_criteria = %s,
            key_indicators = %s,
            updated_at = NOW()
        WHERE projects.id = %s
          AND projects.archived_at IS NULL
        """,
        (
            normalize_optional_text(payload.objectives),
            normalize_optional_text(payload.expected_outcomes),
            normalize_optional_text(payload.success_criteria),
            normalize_optional_text(payload.key_indicators),
            project_id,
        ),
    )
    return build_project_setup_response(session, project_id)


@router.patch("/{project_id}/setup/work-plan", response_model=ProjectSetupResponse)
def update_project_setup_work_plan(
    project_id: UUID,
    payload: ProjectSetupWorkPlanUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Planned completion cannot be before planned start")
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()

    session.execute(
        """
        UPDATE projects
        SET start_date = %s,
            end_date = %s,
            work_plan_details = %s,
            key_activities = %s,
            updated_at = NOW()
        WHERE projects.id = %s
          AND projects.archived_at IS NULL
        """,
        (
            payload.start_date,
            payload.end_date,
            normalize_optional_text(payload.work_plan_details),
            normalize_optional_text(payload.key_activities),
            project_id,
        ),
    )
    return build_project_setup_response(session, project_id)


@router.post("/{project_id}/setup/work-plan/entries", response_model=ProjectSetupWorkPlanEntryResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_work_plan_entry(
    project_id: UUID,
    payload: ProjectSetupWorkPlanEntryCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupWorkPlanEntryResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    validate_work_plan_entry_payload(session, project_id, payload)
    row = session.fetch_one(
        """
        INSERT INTO project_work_plan_entries
          (project_id, phase_id, name, details, key_activities, start_date, end_date, created_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (project_id, payload.phase_id, payload.name.strip(), payload.details.strip(), payload.key_activities.strip(), payload.start_date, payload.end_date, current_user.id),
    )
    return project_setup_work_plan_entry_to_response(fetch_project_setup_work_plan_entry(session, project_id, row["id"]))


@router.patch("/{project_id}/setup/work-plan/entries/{entry_id}", response_model=ProjectSetupWorkPlanEntryResponse)
def update_project_setup_work_plan_entry(
    project_id: UUID,
    entry_id: UUID,
    payload: ProjectSetupWorkPlanEntryUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupWorkPlanEntryResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    fetch_project_setup_work_plan_entry(session, project_id, entry_id)
    validate_work_plan_entry_payload(session, project_id, payload)
    session.execute(
        """
        UPDATE project_work_plan_entries
        SET phase_id = %s, name = %s, details = %s, key_activities = %s,
            start_date = %s, end_date = %s, updated_at = NOW()
        WHERE project_id = %s AND id = %s
        """,
        (payload.phase_id, payload.name.strip(), payload.details.strip(), payload.key_activities.strip(), payload.start_date, payload.end_date, project_id, entry_id),
    )
    return project_setup_work_plan_entry_to_response(fetch_project_setup_work_plan_entry(session, project_id, entry_id))


@router.delete("/{project_id}/setup/work-plan/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_setup_work_plan_entry(
    project_id: UUID,
    entry_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> None:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    fetch_project_setup_work_plan_entry(session, project_id, entry_id)
    session.execute("DELETE FROM project_work_plan_entries WHERE project_id = %s AND id = %s", (project_id, entry_id))


@router.get("/{project_id}/setup/budget", response_model=ProjectSetupBudgetResponse)
def get_project_setup_budget(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupBudgetResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_budget_view_role(session, current_user.id, project_id)
    project = fetch_project_setup_project(session, project_id)
    if project is None:
        raise_project_not_found()
    return ProjectSetupBudgetResponse(
        total_project_budget=project["budget_allocated"],
        budget_notes=project.get("budget_notes"),
    )


@router.patch("/{project_id}/setup/budget", response_model=ProjectSetupResponse)
def update_project_setup_budget(
    project_id: UUID,
    payload: ProjectSetupBudgetUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()

    phase_ids = [allocation.phase_id for allocation in payload.phase_allocations]
    if len(phase_ids) != len(set(phase_ids)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Phase allocations must not contain duplicate phases")
    if phase_ids:
        accessible_phase_ids = {
            row["id"]
            for row in session.fetch_all(
                """
                SELECT id
                FROM phases
                WHERE project_id = %s
                  AND archived_at IS NULL
                  AND id = ANY(%s)
                """,
                (project_id, phase_ids),
            )
        }
        if accessible_phase_ids != set(phase_ids):
            raise_phase_not_found()

    session.execute(
        """
        UPDATE projects
        SET budget_allocated = %s,
            budget_notes = %s,
            updated_at = NOW()
        WHERE id = %s
          AND archived_at IS NULL
        """,
        (payload.total_project_budget, normalize_optional_text(payload.budget_notes), project_id),
    )
    for allocation in payload.phase_allocations:
        session.execute(
            """
            UPDATE phases
            SET budget_allocated = %s,
                updated_at = NOW()
            WHERE project_id = %s
              AND id = %s
              AND archived_at IS NULL
            """,
            (allocation.allocated, project_id, allocation.phase_id),
        )
    return build_project_setup_response(session, project_id)


@router.get("/{project_id}/setup/milestones", response_model=list[ProjectSetupMilestoneResponse])
def list_project_setup_milestones(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupMilestoneResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [project_setup_milestone_to_response(row) for row in fetch_project_setup_milestones(session, project_id)]


@router.post("/{project_id}/setup/milestones", response_model=ProjectSetupMilestoneResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_milestone(
    project_id: UUID,
    payload: ProjectSetupMilestoneCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupMilestoneResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if payload.responsible_user_id is not None:
        fetch_project_member(session, project_id, payload.responsible_user_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Milestone name is required")
    row = session.fetch_one(
        """
        INSERT INTO project_milestones (project_id, name, target_date, responsible_user_id, status, created_by)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (project_id, name, payload.target_date, payload.responsible_user_id, payload.status, current_user.id),
    )
    return project_setup_milestone_to_response(fetch_project_setup_milestone_or_404(session, project_id, row["id"]))


@router.get("/{project_id}/setup/deliverables", response_model=list[ProjectSetupDeliverableResponse])
def list_project_setup_deliverables(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupDeliverableResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [project_setup_deliverable_to_response(row) for row in fetch_project_setup_deliverables(session, project_id)]


@router.post("/{project_id}/setup/deliverables", response_model=ProjectSetupDeliverableResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_deliverable(
    project_id: UUID,
    payload: ProjectSetupDeliverableCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupDeliverableResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    fetch_task_in_project_or_404(session, project_id, payload.task_id)
    if payload.owner_id is not None:
        fetch_project_member(session, project_id, payload.owner_id)
    if payload.approver_id is not None:
        fetch_project_member(session, project_id, payload.approver_id)
    description = payload.description.strip()
    if not description:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Deliverable is required")
    display_order = next_task_deliverable_display_order(session, payload.task_id)
    row = session.fetch_one(
        """
        INSERT INTO task_deliverables (
          task_id,
          description,
          display_order,
          owner_id,
          due_date,
          acceptance_criteria,
          approver_id
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            payload.task_id,
            description,
            display_order,
            payload.owner_id,
            payload.due_date,
            normalize_optional_text(payload.acceptance_criteria),
            payload.approver_id,
        ),
    )
    return project_setup_deliverable_to_response(fetch_project_setup_deliverable_or_404(session, project_id, row["id"]))


@router.get("/{project_id}/setup/resources", response_model=list[ProjectSetupResourceResponse])
def list_project_setup_resources(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupResourceResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [project_setup_resource_to_response(row) for row in fetch_project_setup_resources(session, project_id)]


@router.post("/{project_id}/setup/resources", response_model=ProjectSetupResourceResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_resource(
    project_id: UUID,
    payload: ProjectSetupResourceCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupResourceResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Resource name is required")
    row = session.fetch_one(
        """
        INSERT INTO project_resources (project_id, resource_type, name, notes, created_by)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        (project_id, payload.resource_type, name, normalize_optional_text(payload.notes), current_user.id),
    )
    return project_setup_resource_to_response(fetch_project_setup_resource_or_404(session, project_id, row["id"]))


@router.get("/{project_id}/setup/risks-issues", response_model=list[ProjectSetupRiskIssueResponse])
def list_project_setup_risks_issues(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupRiskIssueResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [project_setup_risk_issue_to_response(row) for row in fetch_project_setup_risks_issues(session, project_id)]


@router.post("/{project_id}/setup/risks-issues", response_model=ProjectSetupRiskIssueResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_risk_issue(
    project_id: UUID,
    payload: ProjectSetupRiskIssueCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupRiskIssueResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if payload.owner_id is not None:
        fetch_project_member(session, project_id, payload.owner_id)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Risk or issue is required")
    row = session.fetch_one(
        """
        INSERT INTO project_risks_issues (
          project_id, item_type, title, likelihood, impact, mitigation, owner_id, status, created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            project_id,
            payload.item_type,
            title,
            payload.likelihood,
            payload.impact,
            normalize_optional_text(payload.mitigation),
            payload.owner_id,
            payload.status,
            current_user.id,
        ),
    )
    return project_setup_risk_issue_to_response(fetch_project_setup_risk_issue_or_404(session, project_id, row["id"]))


@router.get("/{project_id}/setup/assumptions-constraints", response_model=list[ProjectSetupAssumptionConstraintResponse])
def list_project_setup_assumptions_constraints(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupAssumptionConstraintResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [ProjectSetupAssumptionConstraintResponse(**row) for row in fetch_project_setup_assumptions_constraints(session, project_id)]


@router.post("/{project_id}/setup/assumptions-constraints", response_model=ProjectSetupAssumptionConstraintResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_assumption_constraint(
    project_id: UUID,
    payload: ProjectSetupAssumptionConstraintCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupAssumptionConstraintResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    description = payload.description.strip()
    if not description:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Assumption or constraint is required")
    row = session.fetch_one(
        """
        INSERT INTO project_assumptions_constraints (project_id, entry_type, description, impact_notes, created_by)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING *
        """,
        (project_id, payload.entry_type, description, normalize_optional_text(payload.impact_notes), current_user.id),
    )
    return ProjectSetupAssumptionConstraintResponse(**row)


@router.get("/{project_id}/setup/dependencies", response_model=list[ProjectSetupDependencyResponse])
def list_project_setup_dependencies(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupDependencyResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [project_setup_dependency_to_response(row) for row in fetch_project_setup_dependencies(session, project_id)]


@router.post("/{project_id}/setup/dependencies", response_model=ProjectSetupDependencyResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_dependency(
    project_id: UUID,
    payload: ProjectSetupDependencyCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupDependencyResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if payload.related_phase_id is not None:
        ensure_phase_in_project(session, project_id, payload.related_phase_id)
    if payload.related_task_id is not None:
        fetch_task_in_project_or_404(session, project_id, payload.related_task_id)
    if payload.responsible_user_id is not None:
        fetch_project_member(session, project_id, payload.responsible_user_id)
    description = payload.description.strip()
    if not description:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Dependency is required")
    row = session.fetch_one(
        """
        INSERT INTO project_dependencies (
          project_id,
          description,
          dependency_type,
          related_phase_id,
          related_task_id,
          responsible_user_id,
          responsible_party,
          required_by_date,
          created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            project_id,
            description,
            payload.dependency_type,
            payload.related_phase_id,
            payload.related_task_id,
            payload.responsible_user_id,
            normalize_optional_text(payload.responsible_party),
            payload.required_by_date,
            current_user.id,
        ),
    )
    return project_setup_dependency_to_response(fetch_project_setup_dependency_or_404(session, project_id, row["id"]))


@router.get("/{project_id}/setup/stakeholders", response_model=list[ProjectSetupStakeholderResponse])
def list_project_setup_stakeholders(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupStakeholderResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [ProjectSetupStakeholderResponse(**row) for row in fetch_project_setup_stakeholders(session, project_id)]


@router.post("/{project_id}/setup/stakeholders", response_model=ProjectSetupStakeholderResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_stakeholder(
    project_id: UUID,
    payload: ProjectSetupStakeholderCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupStakeholderResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    name = payload.name.strip()
    interest_role = payload.interest_role.strip()
    if not name or not interest_role:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Stakeholder and interest or role are required")
    row = session.fetch_one(
        """
        INSERT INTO project_stakeholders (
          project_id, name, organisation_group, interest_role, influence_importance, engagement_notes, created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (
            project_id,
            name,
            normalize_optional_text(payload.organisation_group),
            interest_role,
            normalize_optional_text(payload.influence_importance),
            normalize_optional_text(payload.engagement_notes),
            current_user.id,
        ),
    )
    return ProjectSetupStakeholderResponse(**row)


@router.get("/{project_id}/setup/communication-plan", response_model=list[ProjectSetupCommunicationPlanResponse])
def list_project_setup_communication_plan(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupCommunicationPlanResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [project_setup_communication_plan_to_response(row) for row in fetch_project_setup_communication_plan(session, project_id)]


@router.post("/{project_id}/setup/communication-plan", response_model=ProjectSetupCommunicationPlanResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_communication_plan(
    project_id: UUID,
    payload: ProjectSetupCommunicationPlanCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupCommunicationPlanResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if payload.responsible_user_id is not None:
        fetch_project_member(session, project_id, payload.responsible_user_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    audience = payload.audience.strip()
    information = payload.information.strip()
    frequency = payload.frequency.strip()
    method = payload.method.strip()
    if not audience or not information or not frequency or not method:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Communication plan fields are required")
    row = session.fetch_one(
        """
        INSERT INTO project_communication_plan_items (
          project_id, audience, information, frequency, responsible_user_id, method, created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            project_id,
            audience,
            information,
            frequency,
            payload.responsible_user_id,
            method,
            current_user.id,
        ),
    )
    return project_setup_communication_plan_to_response(fetch_project_setup_communication_plan_item_or_404(session, project_id, row["id"]))


@router.get("/{project_id}/setup/monitoring-reporting", response_model=list[ProjectSetupMonitoringReportingResponse])
def list_project_setup_monitoring_reporting(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupMonitoringReportingResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [project_setup_monitoring_reporting_to_response(row) for row in fetch_project_setup_monitoring_reporting(session, project_id)]


@router.post("/{project_id}/setup/monitoring-reporting", response_model=ProjectSetupMonitoringReportingResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_monitoring_reporting(
    project_id: UUID,
    payload: ProjectSetupMonitoringReportingCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupMonitoringReportingResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if payload.responsible_user_id is not None:
        fetch_project_member(session, project_id, payload.responsible_user_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    monitored_item = payload.monitored_item.strip()
    reporting_frequency = payload.reporting_frequency.strip()
    if not monitored_item or not reporting_frequency:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Monitoring and reporting fields are required")
    row = session.fetch_one(
        """
        INSERT INTO project_monitoring_reporting_items (
          project_id, monitored_item, reporting_frequency, responsible_user_id, key_measures, reporting_notes, created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            project_id,
            monitored_item,
            reporting_frequency,
            payload.responsible_user_id,
            normalize_optional_text(payload.key_measures),
            normalize_optional_text(payload.reporting_notes),
            current_user.id,
        ),
    )
    return project_setup_monitoring_reporting_to_response(fetch_project_setup_monitoring_reporting_item_or_404(session, project_id, row["id"]))


@router.get("/{project_id}/setup/approvals", response_model=list[ProjectSetupApprovalResponse])
def list_project_setup_approvals(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupApprovalResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [project_setup_approval_to_response(row) for row in fetch_project_setup_approvals(session, project_id)]


@router.post("/{project_id}/setup/approvals", response_model=ProjectSetupApprovalResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_approval(
    project_id: UUID,
    payload: ProjectSetupApprovalCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupApprovalResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if payload.approver_id is not None:
        fetch_project_member(session, project_id, payload.approver_id)
    if payload.approval_document_file_id is not None:
        fetch_project_file_or_404(session, project_id, payload.approval_document_file_id)
    required_approval = payload.required_approval.strip()
    if not required_approval:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Required approval is required")
    row = session.fetch_one(
        """
        INSERT INTO project_approvals (
          project_id, required_approval, approver_id, due_date, status, approval_document_file_id, created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            project_id,
            required_approval,
            payload.approver_id,
            payload.due_date,
            payload.status,
            payload.approval_document_file_id,
            current_user.id,
        ),
    )
    return project_setup_approval_to_response(fetch_project_setup_approval_or_404(session, project_id, row["id"]))


@router.get("/{project_id}/setup/changes", response_model=list[ProjectSetupChangeResponse])
def list_project_setup_changes(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupChangeResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [project_setup_change_to_response(row) for row in fetch_project_setup_changes(session, project_id)]


@router.post("/{project_id}/setup/changes", response_model=ProjectSetupChangeResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_change(
    project_id: UUID,
    payload: ProjectSetupChangeCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupChangeResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    if payload.approved_by_id is not None:
        fetch_project_member(session, project_id, payload.approved_by_id)
    change_description = payload.change_description.strip()
    reason = payload.reason.strip()
    if not change_description or not reason:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Change description and reason are required")
    row = session.fetch_one(
        """
        INSERT INTO project_changes (
          project_id, change_description, reason, approved_by_id, approved_date, notes, created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            project_id,
            change_description,
            reason,
            payload.approved_by_id,
            payload.approved_date,
            normalize_optional_text(payload.notes),
            current_user.id,
        ),
    )
    return project_setup_change_to_response(fetch_project_setup_change_or_404(session, project_id, row["id"]))


@router.get("/{project_id}/setup/project-specific-information", response_model=list[ProjectSetupSpecificInformationResponse])
def list_project_setup_specific_information(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupSpecificInformationResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [ProjectSetupSpecificInformationResponse(**row) for row in fetch_project_setup_specific_information(session, project_id)]


@router.post("/{project_id}/setup/project-specific-information", response_model=ProjectSetupSpecificInformationResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_specific_information(
    project_id: UUID,
    payload: ProjectSetupSpecificInformationCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupSpecificInformationResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    label = payload.label.strip()
    value = payload.value.strip()
    if not label or not value:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Project-specific label and value are required")
    row = session.fetch_one(
        """
        INSERT INTO project_specific_information (project_id, label, value, created_by)
        VALUES (%s, %s, %s, %s)
        RETURNING *
        """,
        (project_id, label, value, current_user.id),
    )
    return ProjectSetupSpecificInformationResponse(**row)


@router.get("/{project_id}/setup/notes", response_model=list[ProjectSetupNoteResponse])
def list_project_setup_notes(
    project_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[ProjectSetupNoteResponse]:
    ensure_project_access(session, current_user.id, project_id)
    if fetch_project_setup_project(session, project_id) is None:
        raise_project_not_found()
    return [ProjectSetupNoteResponse(**row) for row in fetch_project_setup_notes(session, project_id)]


@router.post("/{project_id}/setup/notes", response_model=ProjectSetupNoteResponse, status_code=status.HTTP_201_CREATED)
def create_project_setup_note(
    project_id: UUID,
    payload: ProjectSetupNoteCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> ProjectSetupNoteResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
    note = payload.note.strip()
    if not note:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Project setup note is required")
    row = session.fetch_one(
        """
        INSERT INTO project_setup_notes (project_id, note, created_by)
        VALUES (%s, %s, %s)
        RETURNING *
        """,
        (project_id, note, current_user.id),
    )
    return ProjectSetupNoteResponse(**row)


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
        setup=build_project_setup_response(session, project_id),
    )


@router.post("/{project_id}/phases", response_model=PhaseResponse, status_code=status.HTTP_201_CREATED)
def create_phase(
    project_id: UUID,
    payload: PhaseCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> PhaseResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_pm(session, current_user.id, project_id)
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
    ensure_project_pm(session, current_user.id, project_id)
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
    ensure_project_pm(session, current_user.id, project_id)
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


@router.get("/{project_id}/phases/{phase_id}/budget", response_model=PhaseResponse)
def get_phase_budget(
    project_id: UUID,
    phase_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> PhaseResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_budget_view_role(session, current_user.id, project_id)
    return phase_to_response(fetch_project_phase_or_404(session, project_id, phase_id))


@router.patch("/{project_id}/phases/{phase_id}/budget", response_model=PhaseResponse)
def update_phase_budget(
    project_id: UUID,
    phase_id: UUID,
    payload: PhaseBudgetUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> PhaseResponse:
    ensure_project_access(session, current_user.id, project_id)
    ensure_project_budget_edit_role(session, current_user.id, project_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return phase_to_response(fetch_project_phase_or_404(session, project_id, phase_id))
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
    params = [*values.values(), project_id, phase_id]
    row = session.fetch_one(
        f"""
        UPDATE phases
        SET {set_clause}
        WHERE project_id = %s
          AND id = %s
          AND archived_at IS NULL
        RETURNING id
        """,
        params,
    )
    if row is None:
        raise_phase_not_found()
    return phase_to_response(fetch_project_phase_or_404(session, project_id, phase_id))


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
    ensure_project_pm(session, current_user.id, project_id)
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
    ensure_project_pm(session, current_user.id, project_id)
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
    ensure_project_pm(session, current_user.id, project_id)
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
    current_task = fetch_project_task_or_404(session, project_id, phase_id, task_id)
    ensure_task_status_update_allowed(session, current_user.id, project_id, current_task)
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
    task = fetch_project_task_or_404(session, project_id, phase_id, task_id)
    ensure_task_work_allowed(session, current_user.id, project_id, task)
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
    task = fetch_project_task_or_404(session, project_id, phase_id, task_id)
    ensure_task_work_allowed(session, current_user.id, project_id, task)
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
    task = fetch_project_task_or_404(session, project_id, phase_id, task_id)
    ensure_task_work_allowed(session, current_user.id, project_id, task)
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
    task = fetch_project_task_or_404(session, project_id, phase_id, task_id)
    ensure_task_work_allowed(session, current_user.id, project_id, task)
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
    mentioned_user_ids = list(dict.fromkeys(payload.mentioned_user_ids))
    if mentioned_user_ids:
        valid_mentions = session.fetch_all(
            """
            SELECT user_id FROM project_members
            WHERE project_id = %s AND user_id = ANY(%s)
            """,
            (project_id, mentioned_user_ids),
        )
        if {row["user_id"] for row in valid_mentions} != set(mentioned_user_ids):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Mentioned users must be members of this project.")
    comment = session.fetch_one(
        """
        INSERT INTO comments (task_id, user_id, comment)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (task_id, current_user.id, payload.comment),
    )
    for mentioned_user_id in mentioned_user_ids:
        session.execute(
            "INSERT INTO comment_mentions (comment_id, user_id) VALUES (%s, %s)",
            (comment["id"], mentioned_user_id),
        )
    return task_comment_to_response(fetch_task_comment_or_404(session, task_id, comment["id"], current_user.id))


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
    return [task_comment_to_response(row) for row in fetch_task_comments(session, task_id, current_user.id)]


@router.get("/comment-notifications/unread", response_model=list[CommentNotificationResponse])
def list_unread_comment_notifications(
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> list[CommentNotificationResponse]:
    rows = session.fetch_all(
        """
        SELECT comments.id, projects.id AS project_id, projects.name AS project_name,
               phases.id AS phase_id, phases.name AS phase_name,
               tasks.id AS task_id, tasks.name AS task_name,
               users.name AS commenter_name, comments.comment, comments.created_at
        FROM comments
        JOIN tasks ON tasks.id = comments.task_id
        JOIN phases ON phases.id = tasks.phase_id
        JOIN projects ON projects.id = phases.project_id
        JOIN project_members ON project_members.project_id = projects.id
                            AND project_members.user_id = %s
        JOIN users ON users.id = comments.user_id
        LEFT JOIN comment_read_state
          ON comment_read_state.user_id = %s AND comment_read_state.task_id = tasks.id
        WHERE projects.archived_at IS NULL
          AND phases.archived_at IS NULL
          AND comments.user_id <> %s
          AND (
            comments.user_id = %s
            OR NOT EXISTS (SELECT 1 FROM comment_mentions WHERE comment_id = comments.id)
            OR EXISTS (SELECT 1 FROM comment_mentions WHERE comment_id = comments.id AND user_id = %s)
          )
          AND comments.created_at > COALESCE(comment_read_state.last_seen_comment_at, TIMESTAMPTZ 'epoch')
        ORDER BY comments.created_at DESC, comments.id DESC
        LIMIT 100
        """,
        (current_user.id, current_user.id, current_user.id, current_user.id, current_user.id),
    )
    return [CommentNotificationResponse(**row) for row in rows]


@router.post("/comment-notifications/{project_id}/tasks/{task_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_task_comments_read(
    project_id: UUID,
    task_id: UUID,
    current_user: AuthenticatedUser = Depends(get_current_user),
    session: DatabaseSession = Depends(get_authenticated_db_session),
) -> Response:
    ensure_project_access(session, current_user.id, project_id)
    fetch_task_in_project_or_404(session, project_id, task_id)
    latest = session.fetch_one("SELECT MAX(created_at) AS last_seen_comment_at FROM comments WHERE task_id = %s", (task_id,))
    if latest["last_seen_comment_at"] is not None:
        session.execute(
            """
            INSERT INTO comment_read_state (user_id, task_id, last_seen_comment_at)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, task_id) DO UPDATE SET last_seen_comment_at = EXCLUDED.last_seen_comment_at, updated_at = NOW()
            """,
            (current_user.id, task_id, latest["last_seen_comment_at"]),
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    setup_document_type: SetupDocumentType | None = Form(None),
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
                  file_category,
                  setup_document_type
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
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
                    setup_document_type,
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
    return [
        task_file_to_response(row)
        for row in fetch_task_files(session, task_id)
        if project_file_visible(session, current_user.id, project_id, row)
    ]


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
    ensure_project_file_visible(session, current_user.id, project_id, metadata)
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

    ensure_project_pm(session, current_user.id, project_id)

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
    ensure_project_pm(session, current_user.id, project_id)
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
          phases.budget_allocated,
          phases.budget_spent,
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


def fetch_task_in_project_or_404(session: DatabaseSession, project_id: UUID, task_id: UUID) -> Row:
    task = session.fetch_one(
        """
        SELECT tasks.id
        FROM tasks
        JOIN phases ON phases.id = tasks.phase_id
        WHERE tasks.id = %s
          AND phases.project_id = %s
          AND phases.archived_at IS NULL
        """,
        (task_id, project_id),
    )
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


def fetch_task_comments(session: DatabaseSession, task_id: UUID, viewer_id: UUID | None = None) -> list[Row]:
    visibility = "" if viewer_id is None else """
          AND (
            comments.user_id = %s
            OR NOT EXISTS (SELECT 1 FROM comment_mentions WHERE comment_id = comments.id)
            OR EXISTS (SELECT 1 FROM comment_mentions WHERE comment_id = comments.id AND user_id = %s)
          )
    """
    params: tuple[Any, ...] = (task_id,) if viewer_id is None else (task_id, viewer_id, viewer_id)
    return session.fetch_all(
        f"""
        SELECT
          comments.id,
          comments.task_id,
          comments.user_id,
          users.name AS author_name,
          users.email AS author_email,
          comments.comment,
          comments.created_at,
          comments.updated_at,
          COALESCE(ARRAY(SELECT user_id FROM comment_mentions WHERE comment_id = comments.id), ARRAY[]::uuid[]) AS mentioned_user_ids
        FROM comments
        JOIN users ON users.id = comments.user_id
        WHERE comments.task_id = %s
        {visibility}
        ORDER BY comments.created_at, comments.id
        """,
        params,
    )


def fetch_task_comment(session: DatabaseSession, task_id: UUID, comment_id: UUID, viewer_id: UUID | None = None) -> Row | None:
    visibility = "" if viewer_id is None else """
          AND (
            comments.user_id = %s
            OR NOT EXISTS (SELECT 1 FROM comment_mentions WHERE comment_id = comments.id)
            OR EXISTS (SELECT 1 FROM comment_mentions WHERE comment_id = comments.id AND user_id = %s)
          )
    """
    params: tuple[Any, ...] = (task_id, comment_id) if viewer_id is None else (task_id, comment_id, viewer_id, viewer_id)
    return session.fetch_one(
        f"""
        SELECT
          comments.id,
          comments.task_id,
          comments.user_id,
          users.name AS author_name,
          users.email AS author_email,
          comments.comment,
          comments.created_at,
          comments.updated_at,
          COALESCE(ARRAY(SELECT user_id FROM comment_mentions WHERE comment_id = comments.id), ARRAY[]::uuid[]) AS mentioned_user_ids
        FROM comments
        JOIN users ON users.id = comments.user_id
        WHERE comments.task_id = %s
          AND comments.id = %s
        {visibility}
        """,
        params,
    )


def fetch_task_comment_or_404(session: DatabaseSession, task_id: UUID, comment_id: UUID, viewer_id: UUID | None = None) -> Row:
    comment = fetch_task_comment(session, task_id, comment_id, viewer_id)
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
          task_files.setup_document_type,
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
          task_files.setup_document_type,
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


def fetch_project_files(session: DatabaseSession, project_id: UUID, include_finance: bool) -> list[Row]:
    finance_filter = "" if include_finance else "AND task_files.file_category <> 'finance'"
    return session.fetch_all(
        f"""
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
          task_files.setup_document_type,
          task_files.folder_id,
          task_files.created_at,
          phases.project_id,
          phases.id AS phase_id,
          phases.name AS phase_name,
          tasks.name AS task_name
        FROM task_files
        JOIN tasks ON tasks.id = task_files.task_id
        JOIN phases ON phases.id = tasks.phase_id
        JOIN users ON users.id = task_files.uploaded_by
        WHERE phases.project_id = %s
          {finance_filter}
        ORDER BY task_files.created_at DESC, task_files.id DESC
        """,
        (project_id,),
    )


def fetch_project_file_or_404(session: DatabaseSession, project_id: UUID, file_id: UUID) -> Row:
    row = session.fetch_one(
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
          task_files.setup_document_type,
          task_files.folder_id,
          task_files.created_at,
          phases.project_id,
          phases.id AS phase_id,
          phases.name AS phase_name,
          tasks.name AS task_name
        FROM task_files
        JOIN tasks ON tasks.id = task_files.task_id
        JOIN phases ON phases.id = tasks.phase_id
        JOIN users ON users.id = task_files.uploaded_by
        WHERE phases.project_id = %s
          AND task_files.id = %s
        """,
        (project_id, file_id),
    )
    if row is None:
        raise_task_file_not_found()
    return row


def fetch_workspace_folders(session: DatabaseSession, project_id: UUID, parent_folder_id: UUID | None) -> list[Row]:
    if parent_folder_id is None:
        parent_filter = "parent_folder_id IS NULL"
        params = (project_id,)
    else:
        parent_filter = "parent_folder_id = %s"
        params = (project_id, parent_folder_id)

    return session.fetch_all(
        f"""
        SELECT *
        FROM workspace_folders
        WHERE project_id = %s
          AND {parent_filter}
        ORDER BY LOWER(name), created_at, id
        """,
        params,
    )


def fetch_workspace_files(
    session: DatabaseSession,
    project_id: UUID,
    parent_folder_id: UUID | None,
    include_finance: bool,
) -> list[Row]:
    finance_filter = "" if include_finance else "AND task_files.file_category <> 'finance'"
    if parent_folder_id is None:
        folder_filter = "task_files.folder_id IS NULL"
        params = (project_id,)
    else:
        folder_filter = "task_files.folder_id = %s"
        params = (project_id, parent_folder_id)

    return session.fetch_all(
        f"""
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
          task_files.setup_document_type,
          task_files.folder_id,
          task_files.created_at,
          phases.project_id,
          phases.id AS phase_id,
          phases.name AS phase_name,
          tasks.name AS task_name
        FROM task_files
        JOIN tasks ON tasks.id = task_files.task_id
        JOIN phases ON phases.id = tasks.phase_id
        JOIN users ON users.id = task_files.uploaded_by
        WHERE phases.project_id = %s
          AND {folder_filter}
          {finance_filter}
        ORDER BY task_files.created_at DESC, task_files.id DESC
        """,
        params,
    )


def fetch_workspace_folder(session: DatabaseSession, project_id: UUID, folder_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT *
        FROM workspace_folders
        WHERE project_id = %s
          AND id = %s
        """,
        (project_id, folder_id),
    )


def fetch_workspace_folder_or_404(session: DatabaseSession, project_id: UUID, folder_id: UUID) -> Row:
    folder = fetch_workspace_folder(session, project_id, folder_id)
    if folder is None:
        raise_workspace_folder_not_found()
    return folder


def fetch_workspace_documents(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return fetch_workspace_native_resources(session, "workspace_documents", project_id)


def fetch_workspace_spreadsheets(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return fetch_workspace_native_resources(session, "workspace_spreadsheets", project_id)


def fetch_workspace_documents_in_folder(session: DatabaseSession, project_id: UUID, folder_id: UUID | None) -> list[Row]:
    return fetch_workspace_native_resources(session, "workspace_documents", project_id, folder_id)


def fetch_workspace_spreadsheets_in_folder(session: DatabaseSession, project_id: UUID, folder_id: UUID | None) -> list[Row]:
    return fetch_workspace_native_resources(session, "workspace_spreadsheets", project_id, folder_id)


def fetch_workspace_document_or_404(session: DatabaseSession, project_id: UUID, document_id: UUID) -> Row:
    return fetch_workspace_native_resource_or_404(session, "workspace_documents", project_id, document_id)


def fetch_workspace_spreadsheet_or_404(session: DatabaseSession, project_id: UUID, spreadsheet_id: UUID) -> Row:
    return fetch_workspace_native_resource_or_404(session, "workspace_spreadsheets", project_id, spreadsheet_id)


def fetch_workspace_native_resources(
    session: DatabaseSession,
    table_name: str,
    project_id: UUID,
    folder_id: UUID | None | object = ...,
) -> list[Row]:
    table = workspace_native_resource_table(table_name)
    folder_filter = ""
    params: tuple = (project_id,)
    if folder_id is None:
        folder_filter = "AND folder_id IS NULL"
    elif folder_id is not ...:
        folder_filter = "AND folder_id = %s"
        params = (project_id, folder_id)

    return session.fetch_all(
        f"""
        SELECT *
        FROM {table}
        WHERE project_id = %s
          {folder_filter}
        ORDER BY LOWER(name), created_at, id
        """,
        params,
    )


def fetch_workspace_native_resource_or_404(
    session: DatabaseSession,
    table_name: str,
    project_id: UUID,
    resource_id: UUID,
) -> Row:
    table = workspace_native_resource_table(table_name)
    row = session.fetch_one(
        f"""
        SELECT *
        FROM {table}
        WHERE project_id = %s
          AND id = %s
        """,
        (project_id, resource_id),
    )
    if row is None:
        raise_workspace_native_resource_not_found(table)
    return row


def create_workspace_native_resource(
    session: DatabaseSession,
    table_name: str,
    project_id: UUID,
    user_id: UUID,
    payload: WorkspaceNativeResourceCreateRequest,
) -> Row:
    table = workspace_native_resource_table(table_name)
    name = normalize_workspace_resource_name(payload.name)
    ensure_workspace_native_resource_links(session, project_id, payload.folder_id, payload.task_id)
    return session.fetch_one(
        f"""
        INSERT INTO {table} (
          project_id,
          folder_id,
          task_id,
          name,
          content,
          created_by
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (project_id, payload.folder_id, payload.task_id, name, Jsonb(payload.content), user_id),
    )


def update_workspace_native_resource_content(
    session: DatabaseSession,
    table_name: str,
    project_id: UUID,
    resource_id: UUID,
    content: dict[str, Any],
) -> Row:
    fetch_workspace_native_resource_or_404(session, project_id=project_id, table_name=table_name, resource_id=resource_id)
    table = workspace_native_resource_table(table_name)
    row = session.fetch_one(
        f"""
        UPDATE {table}
        SET content = %s
        WHERE project_id = %s
          AND id = %s
        RETURNING *
        """,
        (Jsonb(content), project_id, resource_id),
    )
    return row


def rename_workspace_native_resource(
    session: DatabaseSession,
    table_name: str,
    project_id: UUID,
    resource_id: UUID,
    name: str,
) -> Row:
    fetch_workspace_native_resource_or_404(session, project_id=project_id, table_name=table_name, resource_id=resource_id)
    table = workspace_native_resource_table(table_name)
    row = session.fetch_one(
        f"""
        UPDATE {table}
        SET name = %s
        WHERE project_id = %s
          AND id = %s
        RETURNING *
        """,
        (normalize_workspace_resource_name(name), project_id, resource_id),
    )
    return row


def move_workspace_native_resource(
    session: DatabaseSession,
    table_name: str,
    project_id: UUID,
    resource_id: UUID,
    folder_id: UUID | None,
) -> Row:
    fetch_workspace_native_resource_or_404(session, project_id=project_id, table_name=table_name, resource_id=resource_id)
    ensure_workspace_native_resource_links(session, project_id, folder_id, None)
    table = workspace_native_resource_table(table_name)
    row = session.fetch_one(
        f"""
        UPDATE {table}
        SET folder_id = %s
        WHERE project_id = %s
          AND id = %s
        RETURNING *
        """,
        (folder_id, project_id, resource_id),
    )
    return row


def update_workspace_native_resource_task_link(
    session: DatabaseSession,
    table_name: str,
    project_id: UUID,
    resource_id: UUID,
    task_id: UUID | None,
) -> Row:
    fetch_workspace_native_resource_or_404(session, project_id=project_id, table_name=table_name, resource_id=resource_id)
    ensure_workspace_native_resource_links(session, project_id, None, task_id)
    table = workspace_native_resource_table(table_name)
    row = session.fetch_one(
        f"""
        UPDATE {table}
        SET task_id = %s
        WHERE project_id = %s
          AND id = %s
        RETURNING *
        """,
        (task_id, project_id, resource_id),
    )
    return row


def delete_workspace_native_resource(
    session: DatabaseSession,
    table_name: str,
    project_id: UUID,
    resource_id: UUID,
) -> None:
    fetch_workspace_native_resource_or_404(session, project_id=project_id, table_name=table_name, resource_id=resource_id)
    table = workspace_native_resource_table(table_name)
    session.execute(
        f"""
        DELETE FROM {table}
        WHERE project_id = %s
          AND id = %s
        """,
        (project_id, resource_id),
    )


def ensure_workspace_native_resource_links(
    session: DatabaseSession,
    project_id: UUID,
    folder_id: UUID | None,
    task_id: UUID | None,
) -> None:
    if folder_id is not None:
        fetch_workspace_folder_or_404(session, project_id, folder_id)
    if task_id is not None:
        fetch_task_in_project_or_404(session, project_id, task_id)


def workspace_native_resource_table(table_name: str) -> str:
    if table_name in {"workspace_documents", "workspace_spreadsheets"}:
        return table_name
    raise RuntimeError("Unsupported workspace native resource table")


def ensure_workspace_folder_name_available(
    session: DatabaseSession,
    project_id: UUID,
    parent_folder_id: UUID | None,
    name: str,
    excluding_folder_id: UUID | None = None,
) -> None:
    if parent_folder_id is None:
        parent_filter = "parent_folder_id IS NULL"
        params: tuple = (project_id, name)
    else:
        parent_filter = "parent_folder_id = %s"
        params = (project_id, name, parent_folder_id)

    exclusion_filter = ""
    if excluding_folder_id is not None:
        exclusion_filter = "AND id <> %s"
        params = (*params, excluding_folder_id)

    row = session.fetch_one(
        f"""
        SELECT EXISTS (
          SELECT 1
          FROM workspace_folders
          WHERE project_id = %s
            AND LOWER(BTRIM(name)) = LOWER(BTRIM(%s))
            AND {parent_filter}
            {exclusion_filter}
        ) AS name_exists
        """,
        params,
    )
    if row["name_exists"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=WORKSPACE_FOLDER_NAME_EXISTS_DETAIL)


def ensure_folder_not_moved_into_descendant(
    session: DatabaseSession,
    project_id: UUID,
    folder_id: UUID,
    next_parent_folder_id: UUID,
) -> None:
    row = session.fetch_one(
        """
        WITH RECURSIVE descendants AS (
          SELECT id
          FROM workspace_folders
          WHERE project_id = %s
            AND parent_folder_id = %s
          UNION ALL
          SELECT child.id
          FROM workspace_folders child
          JOIN descendants ON descendants.id = child.parent_folder_id
          WHERE child.project_id = %s
        )
        SELECT EXISTS (
          SELECT 1
          FROM descendants
          WHERE id = %s
        ) AS is_descendant
        """,
        (project_id, folder_id, project_id, next_parent_folder_id),
    )
    if row["is_descendant"]:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=WORKSPACE_FOLDER_PARENT_DESCENDANT_DETAIL)


def ensure_workspace_folder_empty(session: DatabaseSession, folder_id: UUID) -> None:
    row = session.fetch_one(
        """
        SELECT EXISTS (
          SELECT 1 FROM workspace_folders WHERE parent_folder_id = %s
          UNION ALL
          SELECT 1 FROM task_files WHERE folder_id = %s
          UNION ALL
          SELECT 1 FROM workspace_documents WHERE folder_id = %s
          UNION ALL
          SELECT 1 FROM workspace_spreadsheets WHERE folder_id = %s
        ) AS has_contents
        """,
        (folder_id, folder_id, folder_id, folder_id),
    )
    if row["has_contents"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=WORKSPACE_FOLDER_NON_EMPTY_DETAIL)


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


def ensure_project_budget_view_role(session: DatabaseSession, user_id: UUID, project_id: UUID) -> None:
    if fetch_project_member_role(session, user_id, project_id) not in {"PM", "Finance"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PROJECT_BUDGET_ROLE_REQUIRED_DETAIL,
        )


def ensure_project_budget_edit_role(session: DatabaseSession, user_id: UUID, project_id: UUID) -> None:
    if fetch_project_member_role(session, user_id, project_id) != "Finance":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=PROJECT_BUDGET_ROLE_REQUIRED_DETAIL,
        )


def project_file_finance_visible(session: DatabaseSession, user_id: UUID, project_id: UUID) -> bool:
    return fetch_project_member_role(session, user_id, project_id) in {"PM", "Finance"}


def project_file_visible(session: DatabaseSession, user_id: UUID, project_id: UUID, file_metadata: Row) -> bool:
    return file_metadata["file_category"] != "finance" or project_file_finance_visible(session, user_id, project_id)


def ensure_project_file_visible(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
    file_metadata: Row,
) -> None:
    if not project_file_visible(session, user_id, project_id, file_metadata):
        raise_task_file_not_found()


def ensure_task_file_upload_allowed(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
    task: Row,
    file_category: TaskFileCategory,
) -> None:
    project_role = fetch_project_member_role(session, user_id, project_id)
    if file_category == "finance" and project_role == "Finance":
        return
    if file_category == "finance":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=TASK_FILE_UPLOAD_FORBIDDEN_DETAIL,
        )
    if project_role == "PM":
        return
    if file_category == "work_submission" and (
        task["owner_id"] == user_id or fetch_task_supporter(session, task["id"], user_id) is not None
    ):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=TASK_FILE_UPLOAD_FORBIDDEN_DETAIL,
    )


def ensure_task_work_allowed(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
    task: Row,
) -> None:
    if fetch_project_member_role(session, user_id, project_id) == "PM":
        return
    if task["owner_id"] == user_id or fetch_task_supporter(session, task["id"], user_id) is not None:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You cannot update this task",
    )


def ensure_task_status_update_allowed(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
    task: Row,
) -> None:
    if fetch_project_member_role(session, user_id, project_id) == "PM":
        return
    if task["owner_id"] == user_id:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You cannot update this task",
    )


def fetch_project_budget_or_404(session: DatabaseSession, project_id: UUID) -> Row:
    row = session.fetch_one(
        """
        WITH phase_totals AS (
          SELECT COALESCE(SUM(budget_spent), 0) AS spent
          FROM phases
          WHERE project_id = %s
            AND archived_at IS NULL
        )
        SELECT
          projects.id AS project_id,
          projects.budget_allocated AS allocated,
          phase_totals.spent AS spent,
          projects.budget_allocated - phase_totals.spent AS remaining,
          CASE
            WHEN projects.budget_allocated > 0 THEN phase_totals.spent / projects.budget_allocated
            ELSE 0
          END AS utilisation
        FROM projects
        CROSS JOIN phase_totals
        WHERE projects.id = %s
          AND projects.archived_at IS NULL
        """,
        (project_id, project_id),
    )
    if row is None:
        raise_project_not_found()
    return row


def build_project_setup_response(session: DatabaseSession, project_id: UUID) -> ProjectSetupResponse:
    project = fetch_project_setup_project(session, project_id)
    if project is None:
        raise_project_not_found()

    overrides = {
        row["section_key"]: row
        for row in fetch_project_setup_section_statuses(session, project_id)
    }
    live = fetch_project_setup_live_counts(session, project_id)
    raw_sections: list[ProjectSetupSectionResponse] = []

    for key, label, optional in PROJECT_SETUP_SECTIONS:
        override = overrides.get(key)
        override_status = override["status"] if override else None
        live_status, live_count, live_source = project_setup_live_status(key, project, live, raw_sections)
        if key in DATA_DERIVED_PROJECT_SETUP_SECTION_KEYS:
            resolved_status = live_status
        elif override_status == "Not Applicable":
            resolved_status = "Not Applicable"
        elif live_status != "Not Started":
            resolved_status = live_status
        else:
            resolved_status = override_status or "Not Started"

        raw_sections.append(
            ProjectSetupSectionResponse(
                key=key,
                label=label,
                status=resolved_status,
                optional=optional,
                live_items_count=live_count,
                live_source=live_source,
                updated_by=override["updated_by"] if override else None,
                updated_at=override["updated_at"] if override else None,
            )
        )

    applicable_sections = [section for section in raw_sections if section.status != "Not Applicable"]
    complete_sections = sum(1 for section in applicable_sections if section.status == "Complete")
    total_applicable_sections = len(applicable_sections)
    percent_complete = round((complete_sections / total_applicable_sections) * 100) if total_applicable_sections else 100

    return ProjectSetupResponse(
        project_id=project_id,
        summary=ProjectSetupSummaryResponse(
            complete_sections=complete_sections,
            total_applicable_sections=total_applicable_sections,
            percent_complete=percent_complete,
        ),
        sections=raw_sections,
        details=project_setup_details_to_response(session, project),
    )


def fetch_project_setup_project(session: DatabaseSession, project_id: UUID) -> Row | None:
    return session.fetch_one(
        """
        SELECT
          projects.id,
          projects.code,
          projects.name,
          projects.description,
          projects.objectives,
          projects.funder_partner,
          projects.project_type,
          projects.start_date,
          projects.end_date,
          projects.status,
          projects.budget_allocated,
          projects.budget_notes,
          projects.project_lead_id,
          project_leads.name AS project_lead_name,
          project_leads.email AS project_lead_email,
          projects.project_location_area,
          projects.scope_in,
          projects.scope_out,
          projects.scope_boundaries,
          projects.scope_notes,
          projects.expected_outcomes,
          projects.success_criteria,
          projects.key_indicators,
          projects.work_plan_details,
          projects.key_activities
        FROM projects
        JOIN users AS project_leads ON project_leads.id = projects.project_lead_id
        WHERE projects.id = %s
          AND projects.archived_at IS NULL
        """,
        (project_id,),
    )


def project_setup_details_to_response(session: DatabaseSession, project: Row) -> ProjectSetupDetailsResponse:
    return ProjectSetupDetailsResponse(
        project_overview=ProjectSetupOverviewResponse(
            name=project["name"],
            code=project["code"],
            description=project["description"],
            project_lead=ProjectSetupLeadResponse(
                id=project["project_lead_id"],
                name=project["project_lead_name"],
                email=project["project_lead_email"],
            ),
            start_date=project["start_date"],
            end_date=project["end_date"],
            project_location_area=project.get("project_location_area"),
        ),
        scope=ProjectSetupScopeResponse(
            scope_in=project.get("scope_in"),
            scope_out=project.get("scope_out"),
            scope_boundaries=project.get("scope_boundaries"),
            scope_notes=project.get("scope_notes"),
        ),
        objectives_outcomes=ProjectSetupObjectivesResponse(
            objectives=project.get("objectives"),
            expected_outcomes=project.get("expected_outcomes"),
            success_criteria=project.get("success_criteria"),
            key_indicators=project.get("key_indicators"),
        ),
        work_plan=ProjectSetupWorkPlanResponse(
            work_plan_details=project.get("work_plan_details"),
            planned_start=project["start_date"],
            planned_completion=project["end_date"],
            key_activities=project.get("key_activities"),
            entries=[project_setup_work_plan_entry_to_response(row) for row in fetch_project_setup_work_plan_entries(session, project["id"])],
        ),
    )


def fetch_project_setup_section_statuses(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT section_key, status, updated_by, updated_at
        FROM project_setup_section_statuses
        WHERE project_id = %s
        """,
        (project_id,),
    )


def fetch_project_setup_work_plan_entries(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT entries.id, entries.project_id, entries.name, entries.details,
               entries.key_activities, entries.start_date, entries.end_date,
               entries.phase_id, phases.name AS phase_name, entries.created_by,
               entries.created_at, entries.updated_at
        FROM project_work_plan_entries AS entries
        JOIN phases ON phases.project_id = entries.project_id AND phases.id = entries.phase_id
        WHERE entries.project_id = %s
        ORDER BY entries.start_date, entries.end_date, entries.created_at, entries.id
        """,
        (project_id,),
    )


def fetch_project_setup_work_plan_entry(session: DatabaseSession, project_id: UUID, entry_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT entries.id, entries.project_id, entries.name, entries.details,
               entries.key_activities, entries.start_date, entries.end_date,
               entries.phase_id, phases.name AS phase_name, entries.created_by,
               entries.created_at, entries.updated_at
        FROM project_work_plan_entries AS entries
        JOIN phases ON phases.project_id = entries.project_id AND phases.id = entries.phase_id
        WHERE entries.project_id = %s AND entries.id = %s
        """,
        (project_id, entry_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work Plan entry not found")
    return row


def validate_work_plan_entry_payload(
    session: DatabaseSession,
    project_id: UUID,
    payload: ProjectSetupWorkPlanEntryCreateRequest,
) -> None:
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Work Plan end date cannot be before start date")
    if not payload.name.strip() or not payload.details.strip() or not payload.key_activities.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Work Plan name, details, and key activities are required")
    phase = session.fetch_one("SELECT id FROM phases WHERE project_id = %s AND id = %s", (project_id, payload.phase_id))
    if phase is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Phase must belong to this project")


def project_setup_work_plan_entry_to_response(row: Row) -> ProjectSetupWorkPlanEntryResponse:
    return ProjectSetupWorkPlanEntryResponse(**row)


def fetch_project_setup_milestones(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          project_milestones.id,
          project_milestones.project_id,
          project_milestones.name,
          project_milestones.target_date,
          project_milestones.responsible_user_id,
          responsible_users.name AS responsible_user_name,
          responsible_users.email AS responsible_user_email,
          project_milestones.status,
          project_milestones.created_by,
          project_milestones.created_at,
          project_milestones.updated_at
        FROM project_milestones
        LEFT JOIN users AS responsible_users
          ON responsible_users.id = project_milestones.responsible_user_id
        WHERE project_milestones.project_id = %s
        ORDER BY project_milestones.target_date, project_milestones.created_at, project_milestones.id
        """,
        (project_id,),
    )


def fetch_project_setup_milestone_or_404(session: DatabaseSession, project_id: UUID, milestone_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          project_milestones.id,
          project_milestones.project_id,
          project_milestones.name,
          project_milestones.target_date,
          project_milestones.responsible_user_id,
          responsible_users.name AS responsible_user_name,
          responsible_users.email AS responsible_user_email,
          project_milestones.status,
          project_milestones.created_by,
          project_milestones.created_at,
          project_milestones.updated_at
        FROM project_milestones
        LEFT JOIN users AS responsible_users
          ON responsible_users.id = project_milestones.responsible_user_id
        WHERE project_milestones.project_id = %s
          AND project_milestones.id = %s
        """,
        (project_id, milestone_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project milestone not found")
    return row


def fetch_project_setup_deliverables(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          task_deliverables.id,
          task_deliverables.task_id,
          tasks.name AS task_name,
          phases.id AS phase_id,
          phases.name AS phase_name,
          task_deliverables.description,
          task_deliverables.owner_id,
          owners.name AS owner_name,
          owners.email AS owner_email,
          task_deliverables.due_date,
          task_deliverables.acceptance_criteria,
          task_deliverables.approver_id,
          approvers.name AS approver_name,
          approvers.email AS approver_email,
          task_deliverables.is_completed,
          task_deliverables.display_order,
          task_deliverables.completed_at,
          task_deliverables.created_at,
          task_deliverables.updated_at
        FROM task_deliverables
        JOIN tasks ON tasks.id = task_deliverables.task_id
        JOIN phases ON phases.id = tasks.phase_id
        LEFT JOIN users AS owners ON owners.id = task_deliverables.owner_id
        LEFT JOIN users AS approvers ON approvers.id = task_deliverables.approver_id
        WHERE phases.project_id = %s
          AND phases.archived_at IS NULL
        ORDER BY phases.display_order, tasks.created_at, tasks.id, task_deliverables.display_order
        """,
        (project_id,),
    )


def fetch_project_setup_deliverable_or_404(session: DatabaseSession, project_id: UUID, deliverable_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          task_deliverables.id,
          task_deliverables.task_id,
          tasks.name AS task_name,
          phases.id AS phase_id,
          phases.name AS phase_name,
          task_deliverables.description,
          task_deliverables.owner_id,
          owners.name AS owner_name,
          owners.email AS owner_email,
          task_deliverables.due_date,
          task_deliverables.acceptance_criteria,
          task_deliverables.approver_id,
          approvers.name AS approver_name,
          approvers.email AS approver_email,
          task_deliverables.is_completed,
          task_deliverables.display_order,
          task_deliverables.completed_at,
          task_deliverables.created_at,
          task_deliverables.updated_at
        FROM task_deliverables
        JOIN tasks ON tasks.id = task_deliverables.task_id
        JOIN phases ON phases.id = tasks.phase_id
        LEFT JOIN users AS owners ON owners.id = task_deliverables.owner_id
        LEFT JOIN users AS approvers ON approvers.id = task_deliverables.approver_id
        WHERE phases.project_id = %s
          AND task_deliverables.id = %s
          AND phases.archived_at IS NULL
        """,
        (project_id, deliverable_id),
    )
    if row is None:
        raise_deliverable_not_found()
    return row


def fetch_project_setup_resources(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT id, project_id, resource_type, name, notes, created_by, created_at, updated_at
        FROM project_resources
        WHERE project_id = %s
        ORDER BY resource_type, created_at, id
        """,
        (project_id,),
    )


def fetch_project_setup_resource_or_404(session: DatabaseSession, project_id: UUID, resource_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT id, project_id, resource_type, name, notes, created_by, created_at, updated_at
        FROM project_resources
        WHERE project_id = %s
          AND id = %s
        """,
        (project_id, resource_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project resource not found")
    return row


def fetch_project_setup_risks_issues(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          project_risks_issues.id,
          project_risks_issues.project_id,
          project_risks_issues.item_type,
          project_risks_issues.title,
          project_risks_issues.likelihood,
          project_risks_issues.impact,
          project_risks_issues.mitigation,
          project_risks_issues.owner_id,
          owners.name AS owner_name,
          owners.email AS owner_email,
          project_risks_issues.status,
          project_risks_issues.created_by,
          project_risks_issues.created_at,
          project_risks_issues.updated_at
        FROM project_risks_issues
        LEFT JOIN users AS owners ON owners.id = project_risks_issues.owner_id
        WHERE project_risks_issues.project_id = %s
        ORDER BY project_risks_issues.created_at, project_risks_issues.id
        """,
        (project_id,),
    )


def fetch_project_setup_risk_issue_or_404(session: DatabaseSession, project_id: UUID, risk_issue_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          project_risks_issues.id,
          project_risks_issues.project_id,
          project_risks_issues.item_type,
          project_risks_issues.title,
          project_risks_issues.likelihood,
          project_risks_issues.impact,
          project_risks_issues.mitigation,
          project_risks_issues.owner_id,
          owners.name AS owner_name,
          owners.email AS owner_email,
          project_risks_issues.status,
          project_risks_issues.created_by,
          project_risks_issues.created_at,
          project_risks_issues.updated_at
        FROM project_risks_issues
        LEFT JOIN users AS owners ON owners.id = project_risks_issues.owner_id
        WHERE project_risks_issues.project_id = %s
          AND project_risks_issues.id = %s
        """,
        (project_id, risk_issue_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project risk or issue not found")
    return row


def fetch_project_setup_assumptions_constraints(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT id, project_id, entry_type, description, impact_notes, created_by, created_at, updated_at
        FROM project_assumptions_constraints
        WHERE project_id = %s
        ORDER BY entry_type, created_at, id
        """,
        (project_id,),
    )


def fetch_project_setup_dependencies(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          project_dependencies.id,
          project_dependencies.project_id,
          project_dependencies.description,
          project_dependencies.dependency_type,
          project_dependencies.related_phase_id,
          phases.name AS related_phase_name,
          project_dependencies.related_task_id,
          tasks.name AS related_task_name,
          project_dependencies.responsible_user_id,
          responsible_users.name AS responsible_user_name,
          responsible_users.email AS responsible_user_email,
          project_dependencies.responsible_party,
          project_dependencies.required_by_date,
          project_dependencies.created_by,
          project_dependencies.created_at,
          project_dependencies.updated_at
        FROM project_dependencies
        LEFT JOIN phases
          ON phases.id = project_dependencies.related_phase_id
         AND phases.project_id = project_dependencies.project_id
        LEFT JOIN tasks
          ON tasks.id = project_dependencies.related_task_id
         AND EXISTS (
           SELECT 1
           FROM phases AS task_phases
           WHERE task_phases.id = tasks.phase_id
             AND task_phases.project_id = project_dependencies.project_id
         )
        LEFT JOIN users AS responsible_users
          ON responsible_users.id = project_dependencies.responsible_user_id
        WHERE project_dependencies.project_id = %s
        ORDER BY project_dependencies.required_by_date NULLS LAST, project_dependencies.created_at, project_dependencies.id
        """,
        (project_id,),
    )


def fetch_project_setup_dependency_or_404(session: DatabaseSession, project_id: UUID, dependency_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          project_dependencies.id,
          project_dependencies.project_id,
          project_dependencies.description,
          project_dependencies.dependency_type,
          project_dependencies.related_phase_id,
          phases.name AS related_phase_name,
          project_dependencies.related_task_id,
          tasks.name AS related_task_name,
          project_dependencies.responsible_user_id,
          responsible_users.name AS responsible_user_name,
          responsible_users.email AS responsible_user_email,
          project_dependencies.responsible_party,
          project_dependencies.required_by_date,
          project_dependencies.created_by,
          project_dependencies.created_at,
          project_dependencies.updated_at
        FROM project_dependencies
        LEFT JOIN phases
          ON phases.id = project_dependencies.related_phase_id
         AND phases.project_id = project_dependencies.project_id
        LEFT JOIN tasks
          ON tasks.id = project_dependencies.related_task_id
         AND EXISTS (
           SELECT 1
           FROM phases AS task_phases
           WHERE task_phases.id = tasks.phase_id
             AND task_phases.project_id = project_dependencies.project_id
         )
        LEFT JOIN users AS responsible_users
          ON responsible_users.id = project_dependencies.responsible_user_id
        WHERE project_dependencies.project_id = %s
          AND project_dependencies.id = %s
        """,
        (project_id, dependency_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project dependency not found")
    return row


def fetch_project_setup_stakeholders(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          id,
          project_id,
          name,
          organisation_group,
          interest_role,
          influence_importance,
          engagement_notes,
          created_by,
          created_at,
          updated_at
        FROM project_stakeholders
        WHERE project_id = %s
        ORDER BY created_at, id
        """,
        (project_id,),
    )


def fetch_project_setup_communication_plan(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          project_communication_plan_items.id,
          project_communication_plan_items.project_id,
          project_communication_plan_items.audience,
          project_communication_plan_items.information,
          project_communication_plan_items.frequency,
          project_communication_plan_items.responsible_user_id,
          responsible_users.name AS responsible_user_name,
          responsible_users.email AS responsible_user_email,
          project_communication_plan_items.method,
          project_communication_plan_items.created_by,
          project_communication_plan_items.created_at,
          project_communication_plan_items.updated_at
        FROM project_communication_plan_items
        LEFT JOIN users AS responsible_users
          ON responsible_users.id = project_communication_plan_items.responsible_user_id
        WHERE project_communication_plan_items.project_id = %s
        ORDER BY project_communication_plan_items.created_at, project_communication_plan_items.id
        """,
        (project_id,),
    )


def fetch_project_setup_communication_plan_item_or_404(session: DatabaseSession, project_id: UUID, item_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          project_communication_plan_items.id,
          project_communication_plan_items.project_id,
          project_communication_plan_items.audience,
          project_communication_plan_items.information,
          project_communication_plan_items.frequency,
          project_communication_plan_items.responsible_user_id,
          responsible_users.name AS responsible_user_name,
          responsible_users.email AS responsible_user_email,
          project_communication_plan_items.method,
          project_communication_plan_items.created_by,
          project_communication_plan_items.created_at,
          project_communication_plan_items.updated_at
        FROM project_communication_plan_items
        LEFT JOIN users AS responsible_users
          ON responsible_users.id = project_communication_plan_items.responsible_user_id
        WHERE project_communication_plan_items.project_id = %s
          AND project_communication_plan_items.id = %s
        """,
        (project_id, item_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project communication plan item not found")
    return row


def fetch_project_setup_monitoring_reporting(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          project_monitoring_reporting_items.id,
          project_monitoring_reporting_items.project_id,
          project_monitoring_reporting_items.monitored_item,
          project_monitoring_reporting_items.reporting_frequency,
          project_monitoring_reporting_items.responsible_user_id,
          responsible_users.name AS responsible_user_name,
          responsible_users.email AS responsible_user_email,
          project_monitoring_reporting_items.key_measures,
          project_monitoring_reporting_items.reporting_notes,
          project_monitoring_reporting_items.created_by,
          project_monitoring_reporting_items.created_at,
          project_monitoring_reporting_items.updated_at
        FROM project_monitoring_reporting_items
        LEFT JOIN users AS responsible_users
          ON responsible_users.id = project_monitoring_reporting_items.responsible_user_id
        WHERE project_monitoring_reporting_items.project_id = %s
        ORDER BY project_monitoring_reporting_items.created_at, project_monitoring_reporting_items.id
        """,
        (project_id,),
    )


def fetch_project_setup_monitoring_reporting_item_or_404(session: DatabaseSession, project_id: UUID, item_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          project_monitoring_reporting_items.id,
          project_monitoring_reporting_items.project_id,
          project_monitoring_reporting_items.monitored_item,
          project_monitoring_reporting_items.reporting_frequency,
          project_monitoring_reporting_items.responsible_user_id,
          responsible_users.name AS responsible_user_name,
          responsible_users.email AS responsible_user_email,
          project_monitoring_reporting_items.key_measures,
          project_monitoring_reporting_items.reporting_notes,
          project_monitoring_reporting_items.created_by,
          project_monitoring_reporting_items.created_at,
          project_monitoring_reporting_items.updated_at
        FROM project_monitoring_reporting_items
        LEFT JOIN users AS responsible_users
          ON responsible_users.id = project_monitoring_reporting_items.responsible_user_id
        WHERE project_monitoring_reporting_items.project_id = %s
          AND project_monitoring_reporting_items.id = %s
        """,
        (project_id, item_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project monitoring and reporting item not found")
    return row


def fetch_project_setup_approvals(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          project_approvals.id,
          project_approvals.project_id,
          project_approvals.required_approval,
          project_approvals.approver_id,
          approvers.name AS approver_name,
          approvers.email AS approver_email,
          project_approvals.due_date,
          project_approvals.status,
          project_approvals.approval_document_file_id,
          task_files.file_name AS approval_document_name,
          project_approvals.created_by,
          project_approvals.created_at,
          project_approvals.updated_at
        FROM project_approvals
        LEFT JOIN users AS approvers
          ON approvers.id = project_approvals.approver_id
        LEFT JOIN task_files
          ON task_files.id = project_approvals.approval_document_file_id
        WHERE project_approvals.project_id = %s
        ORDER BY project_approvals.due_date NULLS LAST, project_approvals.created_at, project_approvals.id
        """,
        (project_id,),
    )


def fetch_project_setup_document_categories(session: DatabaseSession, project_id: UUID, user_id: UUID) -> list[Row]:
    finance_filter = "" if project_file_finance_visible(session, user_id, project_id) else "AND task_files.file_category <> 'finance'"
    values = ", ".join("(%s)" for _ in PROJECT_SETUP_DOCUMENT_CATEGORIES)
    return session.fetch_all(
        f"""
        WITH categories(category) AS (VALUES {values})
        SELECT categories.category,
               COALESCE(project_setup_document_categories.status, 'Not Started') AS status,
               COUNT(phases.id)::int AS file_count
        FROM categories
        LEFT JOIN project_setup_document_categories
          ON project_setup_document_categories.project_id = %s
         AND project_setup_document_categories.category = categories.category
        LEFT JOIN task_files
          ON task_files.setup_document_type = categories.category
         {finance_filter}
        LEFT JOIN tasks ON tasks.id = task_files.task_id
        LEFT JOIN phases ON phases.id = tasks.phase_id AND phases.project_id = %s
        GROUP BY categories.category, project_setup_document_categories.status
        ORDER BY MIN(array_position(ARRAY[{', '.join('%s' for _ in PROJECT_SETUP_DOCUMENT_CATEGORIES)}]::varchar[], categories.category))
        """,
        [*PROJECT_SETUP_DOCUMENT_CATEGORIES, project_id, project_id, *PROJECT_SETUP_DOCUMENT_CATEGORIES],
    )


def fetch_project_setup_approval_or_404(session: DatabaseSession, project_id: UUID, approval_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          project_approvals.id,
          project_approvals.project_id,
          project_approvals.required_approval,
          project_approvals.approver_id,
          approvers.name AS approver_name,
          approvers.email AS approver_email,
          project_approvals.due_date,
          project_approvals.status,
          project_approvals.approval_document_file_id,
          task_files.file_name AS approval_document_name,
          project_approvals.created_by,
          project_approvals.created_at,
          project_approvals.updated_at
        FROM project_approvals
        LEFT JOIN users AS approvers
          ON approvers.id = project_approvals.approver_id
        LEFT JOIN task_files
          ON task_files.id = project_approvals.approval_document_file_id
        WHERE project_approvals.project_id = %s
          AND project_approvals.id = %s
        """,
        (project_id, approval_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project approval not found")
    return row


def fetch_project_setup_changes(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT
          project_changes.id,
          project_changes.project_id,
          project_changes.change_description,
          project_changes.reason,
          project_changes.approved_by_id,
          approvers.name AS approved_by_name,
          approvers.email AS approved_by_email,
          project_changes.approved_date,
          project_changes.notes,
          project_changes.created_by,
          project_changes.created_at,
          project_changes.updated_at
        FROM project_changes
        LEFT JOIN users AS approvers
          ON approvers.id = project_changes.approved_by_id
        WHERE project_changes.project_id = %s
        ORDER BY project_changes.approved_date NULLS LAST, project_changes.created_at, project_changes.id
        """,
        (project_id,),
    )


def fetch_project_setup_change_or_404(session: DatabaseSession, project_id: UUID, change_id: UUID) -> Row:
    row = session.fetch_one(
        """
        SELECT
          project_changes.id,
          project_changes.project_id,
          project_changes.change_description,
          project_changes.reason,
          project_changes.approved_by_id,
          approvers.name AS approved_by_name,
          approvers.email AS approved_by_email,
          project_changes.approved_date,
          project_changes.notes,
          project_changes.created_by,
          project_changes.created_at,
          project_changes.updated_at
        FROM project_changes
        LEFT JOIN users AS approvers
          ON approvers.id = project_changes.approved_by_id
        WHERE project_changes.project_id = %s
          AND project_changes.id = %s
        """,
        (project_id, change_id),
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project change not found")
    return row


def fetch_project_setup_specific_information(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT id, project_id, label, value, created_by, created_at, updated_at
        FROM project_specific_information
        WHERE project_id = %s
        ORDER BY created_at, id
        """,
        (project_id,),
    )


def fetch_project_setup_notes(session: DatabaseSession, project_id: UUID) -> list[Row]:
    return session.fetch_all(
        """
        SELECT id, project_id, note, created_by, created_at, updated_at
        FROM project_setup_notes
        WHERE project_id = %s
        ORDER BY created_at, id
        """,
        (project_id,),
    )


def next_task_deliverable_display_order(session: DatabaseSession, task_id: UUID) -> int:
    row = session.fetch_one(
        """
        SELECT COALESCE(MAX(display_order), 0) + 1 AS next_display_order
        FROM task_deliverables
        WHERE task_id = %s
        """,
        (task_id,),
    )
    return int(row["next_display_order"])


def project_setup_milestone_to_response(row: Row) -> ProjectSetupMilestoneResponse:
    responsible_person = None
    if row["responsible_user_id"] is not None:
        responsible_person = ProjectSetupLeadResponse(
            id=row["responsible_user_id"],
            name=row["responsible_user_name"],
            email=row["responsible_user_email"],
        )
    return ProjectSetupMilestoneResponse(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        target_date=row["target_date"],
        responsible_user_id=row["responsible_user_id"],
        responsible_person=responsible_person,
        status=row["status"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def project_setup_deliverable_to_response(row: Row) -> ProjectSetupDeliverableResponse:
    owner = None
    if row["owner_id"] is not None:
        owner = ProjectSetupLeadResponse(id=row["owner_id"], name=row["owner_name"], email=row["owner_email"])
    approver = None
    if row["approver_id"] is not None:
        approver = ProjectSetupLeadResponse(id=row["approver_id"], name=row["approver_name"], email=row["approver_email"])
    return ProjectSetupDeliverableResponse(
        id=row["id"],
        task_id=row["task_id"],
        task_name=row["task_name"],
        phase_id=row["phase_id"],
        phase_name=row["phase_name"],
        description=row["description"],
        owner_id=row["owner_id"],
        owner=owner,
        due_date=row["due_date"],
        acceptance_criteria=row["acceptance_criteria"],
        approver_id=row["approver_id"],
        approver=approver,
        is_completed=row["is_completed"],
        display_order=row["display_order"],
        completed_at=row["completed_at"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def project_setup_resource_to_response(row: Row) -> ProjectSetupResourceResponse:
    return ProjectSetupResourceResponse(**row)


def project_setup_risk_issue_to_response(row: Row) -> ProjectSetupRiskIssueResponse:
    owner = None
    if row["owner_id"] is not None:
        owner = ProjectSetupLeadResponse(
            id=row["owner_id"],
            name=row["owner_name"],
            email=row["owner_email"],
        )
    return ProjectSetupRiskIssueResponse(
        id=row["id"],
        project_id=row["project_id"],
        item_type=row["item_type"],
        title=row["title"],
        likelihood=row["likelihood"],
        impact=row["impact"],
        mitigation=row["mitigation"],
        owner_id=row["owner_id"],
        owner=owner,
        status=row["status"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def project_setup_dependency_to_response(row: Row) -> ProjectSetupDependencyResponse:
    responsible_person = None
    if row["responsible_user_id"] is not None:
        responsible_person = ProjectSetupLeadResponse(
            id=row["responsible_user_id"],
            name=row["responsible_user_name"],
            email=row["responsible_user_email"],
        )
    return ProjectSetupDependencyResponse(
        id=row["id"],
        project_id=row["project_id"],
        description=row["description"],
        dependency_type=row["dependency_type"],
        related_phase_id=row["related_phase_id"],
        related_phase_name=row["related_phase_name"],
        related_task_id=row["related_task_id"],
        related_task_name=row["related_task_name"],
        responsible_user_id=row["responsible_user_id"],
        responsible_person=responsible_person,
        responsible_party=row["responsible_party"],
        required_by_date=row["required_by_date"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def project_setup_communication_plan_to_response(row: Row) -> ProjectSetupCommunicationPlanResponse:
    responsible_person = None
    if row["responsible_user_id"] is not None:
        responsible_person = ProjectSetupLeadResponse(
            id=row["responsible_user_id"],
            name=row["responsible_user_name"],
            email=row["responsible_user_email"],
        )
    return ProjectSetupCommunicationPlanResponse(
        id=row["id"],
        project_id=row["project_id"],
        audience=row["audience"],
        information=row["information"],
        frequency=row["frequency"],
        responsible_user_id=row["responsible_user_id"],
        responsible_person=responsible_person,
        method=row["method"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def project_setup_monitoring_reporting_to_response(row: Row) -> ProjectSetupMonitoringReportingResponse:
    responsible_person = None
    if row["responsible_user_id"] is not None:
        responsible_person = ProjectSetupLeadResponse(
            id=row["responsible_user_id"],
            name=row["responsible_user_name"],
            email=row["responsible_user_email"],
        )
    return ProjectSetupMonitoringReportingResponse(
        id=row["id"],
        project_id=row["project_id"],
        monitored_item=row["monitored_item"],
        reporting_frequency=row["reporting_frequency"],
        responsible_user_id=row["responsible_user_id"],
        responsible_person=responsible_person,
        key_measures=row["key_measures"],
        reporting_notes=row["reporting_notes"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def project_setup_approval_to_response(row: Row) -> ProjectSetupApprovalResponse:
    approver = None
    if row["approver_id"] is not None:
        approver = ProjectSetupLeadResponse(
            id=row["approver_id"],
            name=row["approver_name"],
            email=row["approver_email"],
        )
    return ProjectSetupApprovalResponse(
        id=row["id"],
        project_id=row["project_id"],
        required_approval=row["required_approval"],
        approver_id=row["approver_id"],
        approver=approver,
        due_date=row["due_date"],
        status=row["status"],
        approval_document_file_id=row["approval_document_file_id"],
        approval_document_name=row["approval_document_name"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def project_setup_change_to_response(row: Row) -> ProjectSetupChangeResponse:
    approved_by = None
    if row["approved_by_id"] is not None:
        approved_by = ProjectSetupLeadResponse(
            id=row["approved_by_id"],
            name=row["approved_by_name"],
            email=row["approved_by_email"],
        )
    return ProjectSetupChangeResponse(
        id=row["id"],
        project_id=row["project_id"],
        change_description=row["change_description"],
        reason=row["reason"],
        approved_by_id=row["approved_by_id"],
        approved_by=approved_by,
        approved_date=row["approved_date"],
        notes=row["notes"],
        created_by=row["created_by"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def fetch_project_setup_live_counts(session: DatabaseSession, project_id: UUID) -> Row:
    return session.fetch_one(
        """
        WITH project_phase_counts AS (
          SELECT
            COUNT(*) AS phase_count,
            COUNT(*) FILTER (WHERE start_date IS NOT NULL OR end_date IS NOT NULL) AS milestone_phase_count,
            COUNT(*) FILTER (WHERE start_date IS NOT NULL AND end_date IS NOT NULL) AS dated_phase_count,
            COALESCE(SUM(budget_allocated), 0) AS phase_budget_allocated,
            COALESCE(SUM(budget_spent), 0) AS phase_budget_spent
          FROM phases
          WHERE project_id = %(project_id)s
            AND archived_at IS NULL
        ),
        project_task_counts AS (
          SELECT
            COUNT(*) AS task_count,
            COUNT(task_deliverables.id) AS deliverable_count
          FROM tasks
          JOIN phases ON phases.id = tasks.phase_id
          LEFT JOIN task_deliverables ON task_deliverables.task_id = tasks.id
          WHERE phases.project_id = %(project_id)s
            AND phases.archived_at IS NULL
        ),
        file_counts AS (
          SELECT COUNT(task_files.id) AS file_count
          FROM task_files
          JOIN tasks ON tasks.id = task_files.task_id
          JOIN phases ON phases.id = tasks.phase_id
          WHERE phases.project_id = %(project_id)s
            AND phases.archived_at IS NULL
        ),
        native_counts AS (
          SELECT
            (SELECT COUNT(*) FROM workspace_documents WHERE project_id = %(project_id)s) AS document_count,
            (SELECT COUNT(*) FROM workspace_spreadsheets WHERE project_id = %(project_id)s) AS spreadsheet_count
        ),
        member_counts AS (
          SELECT COUNT(*) AS member_count
          FROM project_members
          WHERE project_id = %(project_id)s
        ),
        milestone_counts AS (
          SELECT COUNT(*) AS milestone_count
          FROM project_milestones
          WHERE project_id = %(project_id)s
        ),
        resource_counts AS (
          SELECT COUNT(*) AS setup_resource_count
          FROM project_resources
          WHERE project_id = %(project_id)s
        ),
        risk_issue_counts AS (
          SELECT COUNT(*) AS risk_issue_count
          FROM project_risks_issues
          WHERE project_id = %(project_id)s
        ),
        assumption_constraint_counts AS (
          SELECT COUNT(*) AS assumption_constraint_count
          FROM project_assumptions_constraints
          WHERE project_id = %(project_id)s
        ),
        dependency_counts AS (
          SELECT COUNT(*) AS dependency_count
          FROM project_dependencies
          WHERE project_id = %(project_id)s
        ),
        stakeholder_counts AS (
          SELECT COUNT(*) AS stakeholder_count
          FROM project_stakeholders
          WHERE project_id = %(project_id)s
        ),
        communication_plan_counts AS (
          SELECT COUNT(*) AS communication_plan_count
          FROM project_communication_plan_items
          WHERE project_id = %(project_id)s
        ),
        monitoring_reporting_counts AS (
          SELECT COUNT(*) AS monitoring_reporting_count
          FROM project_monitoring_reporting_items
          WHERE project_id = %(project_id)s
        ),
        approval_counts AS (
          SELECT COUNT(*) AS approval_count
          FROM project_approvals
          WHERE project_id = %(project_id)s
        ),
        change_counts AS (
          SELECT COUNT(*) AS change_count
          FROM project_changes
          WHERE project_id = %(project_id)s
        ),
        specific_information_counts AS (
          SELECT COUNT(*) AS specific_information_count
          FROM project_specific_information
          WHERE project_id = %(project_id)s
        ),
        setup_note_counts AS (
          SELECT COUNT(*) AS setup_note_count
          FROM project_setup_notes
          WHERE project_id = %(project_id)s
        )
        SELECT
          project_phase_counts.phase_count,
          project_phase_counts.milestone_phase_count,
          project_phase_counts.dated_phase_count,
          project_phase_counts.phase_budget_allocated,
          project_phase_counts.phase_budget_spent,
          project_task_counts.task_count,
          project_task_counts.deliverable_count,
          file_counts.file_count,
          native_counts.document_count,
          native_counts.spreadsheet_count,
          member_counts.member_count,
          milestone_counts.milestone_count,
          resource_counts.setup_resource_count,
          risk_issue_counts.risk_issue_count,
          assumption_constraint_counts.assumption_constraint_count,
          dependency_counts.dependency_count,
          stakeholder_counts.stakeholder_count,
          communication_plan_counts.communication_plan_count,
          monitoring_reporting_counts.monitoring_reporting_count,
          approval_counts.approval_count,
          change_counts.change_count,
          specific_information_counts.specific_information_count,
          setup_note_counts.setup_note_count,
          (SELECT COUNT(*) FROM project_work_plan_entries WHERE project_id = %(project_id)s) AS work_plan_entry_count,
          projects.budget_allocated AS project_budget_allocated
        FROM projects
        CROSS JOIN project_phase_counts
        CROSS JOIN project_task_counts
        CROSS JOIN file_counts
        CROSS JOIN native_counts
        CROSS JOIN member_counts
        CROSS JOIN milestone_counts
        CROSS JOIN resource_counts
        CROSS JOIN risk_issue_counts
        CROSS JOIN assumption_constraint_counts
        CROSS JOIN dependency_counts
        CROSS JOIN stakeholder_counts
        CROSS JOIN communication_plan_counts
        CROSS JOIN monitoring_reporting_counts
        CROSS JOIN approval_counts
        CROSS JOIN change_counts
        CROSS JOIN specific_information_counts
        CROSS JOIN setup_note_counts
        WHERE projects.id = %(project_id)s
        """,
        {"project_id": project_id},
    ) or {}


def project_setup_live_status(
    section_key: str,
    project: Row,
    live: Row,
    previous_sections: list[ProjectSetupSectionResponse],
) -> tuple[ProjectSetupSectionStatus, int, str | None]:
    if section_key == "project_overview":
        has_core = all(project.get(field) for field in ("name", "description", "start_date", "end_date", "status"))
        return ("Complete" if has_core else "In Progress", 1 if has_core else 0, "projects")
    if section_key == "scope":
        required_count = count_present(project, ("scope_in", "scope_out", "scope_boundaries"))
        if required_count == 3:
            return "Complete", required_count, "projects.scope_*"
        optional_count = count_present(project, ("scope_notes",))
        return ("In Progress" if required_count or optional_count else "Not Started", required_count + optional_count, "projects.scope_*")
    if section_key == "objectives_outcomes":
        required_count = count_present(project, ("objectives", "expected_outcomes", "success_criteria"))
        if required_count == 3:
            return "Complete", required_count, "projects.objectives/outcomes"
        optional_count = count_present(project, ("key_indicators",))
        return ("In Progress" if required_count or optional_count else "Not Started", required_count + optional_count, "projects.objectives/outcomes")
    if section_key == "work_plan":
        required_count = count_present(project, ("work_plan_details", "start_date", "end_date", "key_activities"))
        required_count += int(live.get("work_plan_entry_count") or 0)
        if required_count == 4:
            return "Complete", required_count, "projects.work_plan/start_date/end_date"
        if live.get("work_plan_entry_count"):
            return "Complete", required_count, "project_work_plan_entries"
        phase_count = int(live.get("phase_count") or 0)
        task_count = int(live.get("task_count") or 0)
        live_count = required_count + phase_count + task_count
        return ("In Progress" if live_count else "Not Started", live_count, "projects/phases/tasks")
    if section_key == "phases":
        return project_setup_status_from_count(int(live.get("phase_count") or 0), 1, "phases")
    if section_key == "milestones":
        milestone_count = int(live.get("milestone_count") or 0)
        if milestone_count:
            return "Complete", milestone_count, "project_milestones"
        milestone_count = int(live.get("milestone_phase_count") or 0)
        phase_count = int(live.get("phase_count") or 0)
        if phase_count and milestone_count >= phase_count:
            return "Complete", milestone_count, "phases.start_date/end_date"
        return ("In Progress" if milestone_count else "Not Started", milestone_count, "phases.start_date/end_date")
    if section_key == "deliverables":
        return project_setup_status_from_count(int(live.get("deliverable_count") or 0), 1, "task_deliverables")
    if section_key == "people_governance":
        member_count = int(live.get("member_count") or 0)
        if member_count > 1:
            return "Complete", member_count, "project_members"
        if member_count == 1:
            return "In Progress", member_count, "project_members"
        return "Not Started", 0, "project_members"
    if section_key == "stakeholders":
        stakeholder_count = int(live.get("stakeholder_count") or 0)
        if stakeholder_count:
            return "Complete", stakeholder_count, "project_stakeholders"
        return project_setup_status_from_count(max(int(live.get("member_count") or 0) - 1, 0), 1, "project_members")
    if section_key == "resources":
        resource_count = int(live.get("setup_resource_count") or 0)
        if resource_count:
            return "Complete", resource_count, "project_resources"
        workspace_resource_count = int(live.get("file_count") or 0) + int(live.get("document_count") or 0) + int(live.get("spreadsheet_count") or 0)
        return project_setup_status_from_count(workspace_resource_count, 1, "task_files/workspace_resources")
    if section_key == "budget_setup":
        has_project_budget = (live.get("project_budget_allocated") or 0) > 0
        budget_count = int(has_project_budget) + int((live.get("phase_budget_allocated") or 0) > 0) + int((live.get("phase_budget_spent") or 0) > 0) + int(bool(project.get("budget_notes")))
        if has_project_budget:
            return "Complete", budget_count, "projects/phases budget fields"
        return ("In Progress" if budget_count else "Not Started", budget_count, "projects/phases budget fields")
    if section_key == "risks_issues":
        return project_setup_status_from_count(int(live.get("risk_issue_count") or 0), 1, "project_risks_issues")
    if section_key == "assumptions_constraints":
        return project_setup_status_from_count(int(live.get("assumption_constraint_count") or 0), 1, "project_assumptions_constraints")
    if section_key == "dependencies":
        return project_setup_status_from_count(int(live.get("dependency_count") or 0), 1, "project_dependencies")
    if section_key == "communication_plan":
        return project_setup_status_from_count(int(live.get("communication_plan_count") or 0), 1, "project_communication_plan_items")
    if section_key == "monitoring_reporting":
        return project_setup_status_from_count(int(live.get("monitoring_reporting_count") or 0), 1, "project_monitoring_reporting_items")
    if section_key == "approvals_signoff":
        return project_setup_status_from_count(int(live.get("approval_count") or 0), 1, "project_approvals")
    if section_key == "change_management":
        return project_setup_status_from_count(int(live.get("change_count") or 0), 1, "project_changes")
    if section_key == "project_specific_information":
        return project_setup_status_from_count(int(live.get("specific_information_count") or 0), 1, "project_specific_information")
    if section_key == "documents_attachments":
        document_count = int(live.get("file_count") or 0) + int(live.get("document_count") or 0) + int(live.get("spreadsheet_count") or 0)
        return project_setup_status_from_count(document_count, 1, "task_files/workspace_documents/workspace_spreadsheets")
    if section_key == "notes":
        return project_setup_status_from_count(int(live.get("setup_note_count") or 0), 1, "project_setup_notes")
    if section_key == "phase0_completion":
        applicable = [section for section in previous_sections if section.status != "Not Applicable"]
        if applicable and all(section.status == "Complete" for section in applicable):
            return "Complete", len(applicable), "project_setup_sections"
        if any(section.status in {"Complete", "In Progress"} for section in applicable):
            return "In Progress", len(applicable), "project_setup_sections"
        return "Not Started", 0, "project_setup_sections"

    return "Not Started", 0, None


def project_setup_status_from_count(count: int, complete_threshold: int, source: str) -> tuple[ProjectSetupSectionStatus, int, str]:
    if count >= complete_threshold:
        return "Complete", count, source
    if count > 0:
        return "In Progress", count, source
    return "Not Started", 0, source


def count_present(row: Row, fields: tuple[str, ...]) -> int:
    return sum(1 for field in fields if bool(row.get(field)))


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


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
          SELECT
            projects.budget_allocated,
            COALESCE(SUM(phases.budget_spent), 0) AS budget_spent
          FROM projects
          LEFT JOIN phases
            ON phases.project_id = projects.id
           AND phases.archived_at IS NULL
          WHERE projects.id = %(project_id)s
            AND projects.archived_at IS NULL
          GROUP BY projects.id, projects.budget_allocated
        ),
        open_project_risks AS (
          SELECT COUNT(*) AS count, MIN(title) AS first_title
          FROM project_risks_issues
          WHERE project_id = %(project_id)s
            AND status IN ('Open', 'In Progress')
            AND (impact = 'High' OR likelihood = 'High')
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
        UNION ALL
        SELECT
          CASE
            WHEN count = 1 THEN 'Risk/issue: ' || first_title
            ELSE count || ' high risks/issues are open'
          END AS reason,
          'Needs attention' AS severity,
          5 AS sort_order
        FROM open_project_risks
        WHERE count > 0
        ORDER BY sort_order
        """,
        {"project_id": project_id, "user_id": user_id},
    )


def phase_to_response(row: Row) -> PhaseResponse:
    return PhaseResponse(
        **row,
        owner=user_summary_from_row(row, "owner"),
        budget_remaining=row["budget_allocated"] - row["budget_spent"],
        budget_utilisation=phase_budget_utilisation(row),
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


def project_file_to_response(row: Row) -> ProjectFileResponse:
    return ProjectFileResponse(**row)


def workspace_contents_to_response(
    session: DatabaseSession,
    user_id: UUID,
    project_id: UUID,
    parent_folder_id: UUID | None,
) -> WorkspaceContentsResponse:
    can_view_finance_files = project_file_finance_visible(session, user_id, project_id)
    return WorkspaceContentsResponse(
        folders=[
            workspace_folder_to_response(row)
            for row in fetch_workspace_folders(session, project_id, parent_folder_id)
        ],
        files=[
            workspace_file_to_response(row)
            for row in fetch_workspace_files(session, project_id, parent_folder_id, include_finance=can_view_finance_files)
        ],
        documents=[
            workspace_document_to_response(row)
            for row in fetch_workspace_documents_in_folder(session, project_id, parent_folder_id)
        ],
        spreadsheets=[
            workspace_spreadsheet_to_response(row)
            for row in fetch_workspace_spreadsheets_in_folder(session, project_id, parent_folder_id)
        ],
    )


def workspace_folder_to_response(row: Row) -> WorkspaceFolderResponse:
    return WorkspaceFolderResponse(**row)


def workspace_file_to_response(row: Row) -> WorkspaceFileResponse:
    return WorkspaceFileResponse(**row)


def workspace_document_to_response(row: Row) -> WorkspaceDocumentResponse:
    return WorkspaceDocumentResponse(**row)


def workspace_spreadsheet_to_response(row: Row) -> WorkspaceSpreadsheetResponse:
    return WorkspaceSpreadsheetResponse(**row)


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
        budget_remaining=row["budget_allocated"] - row["budget_spent"],
        budget_utilisation=phase_budget_utilisation(row),
    )


def phase_budget_utilisation(row: Row) -> Decimal:
    allocated = row["budget_allocated"]
    if allocated > 0:
        return row["budget_spent"] / allocated
    return Decimal("0")


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


def raise_workspace_folder_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=WORKSPACE_FOLDER_NOT_FOUND_DETAIL)


def raise_workspace_document_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=WORKSPACE_DOCUMENT_NOT_FOUND_DETAIL)


def raise_workspace_spreadsheet_not_found() -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=WORKSPACE_SPREADSHEET_NOT_FOUND_DETAIL)


def raise_workspace_native_resource_not_found(table_name: str) -> None:
    if table_name == "workspace_documents":
        raise_workspace_document_not_found()
    if table_name == "workspace_spreadsheets":
        raise_workspace_spreadsheet_not_found()
    raise RuntimeError("Unsupported workspace native resource table")


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


def normalize_workspace_folder_name(name: str) -> str:
    normalized = name.strip()
    if not normalized or len(normalized) > 200:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=WORKSPACE_FOLDER_NAME_INVALID_DETAIL)
    if "/" in normalized or "\\" in normalized or re.search(r"[\x00-\x1f\x7f]", normalized):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=WORKSPACE_FOLDER_NAME_INVALID_DETAIL)
    return normalized


def normalize_workspace_resource_name(name: str) -> str:
    normalized = name.strip()
    if not normalized or len(normalized) > 200:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=WORKSPACE_RESOURCE_NAME_INVALID_DETAIL)
    if "/" in normalized or "\\" in normalized or re.search(r"[\x00-\x1f\x7f]", normalized):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=WORKSPACE_RESOURCE_NAME_INVALID_DETAIL)
    return normalized


def cleanup_uploaded_file(storage: FileStorage, storage_key: str) -> None:
    try:
        storage.delete(storage_key)
    except FileStorageError:
        logger.exception("Uploaded file cleanup failed for storage key %s", storage_key)
