import type { ProjectHealth, ProjectHealthLabel } from "@/components/common/health-badge";
import type { PhaseStatus, Priority, ProjectStatus, TaskStatus } from "@/components/common/status-badge";

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  description: string;
  project_lead_id: string;
  project_lead: ProjectLead;
  current_phase_id: string | null;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  health: ProjectHealth;
  health_color: string;
  health_label: ProjectHealthLabel;
  health_reasons: string[];
  funder_partner: string | null;
  project_type: string | null;
  objectives: string | null;
  priority: Priority | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ProjectMutationPayload = {
  name: string;
  description: string;
  project_lead_id?: string;
  start_date: string;
  end_date: string;
  status: ProjectStatus;
  funder_partner: string | null;
  project_type: string | null;
  objectives: string | null;
  priority: Priority | null;
};

export type ProjectMember = {
  project_id: string;
  user_id: string;
  name: string;
  email: string;
  role: "PM" | "Team Member" | "Finance";
  joined_at: string;
};

export type ProjectLead = {
  id: string;
  name: string;
  email: string;
};

export type PhaseMember = {
  phase_id: string;
  user_id: string;
  name: string;
  email: string;
  added_at: string;
};

export type DashboardProject = {
  id: string;
  code: string;
  name: string;
  description: string;
  project_lead: ProjectLead;
  status: ProjectStatus;
  health: ProjectHealth;
  health_color: string;
  health_label: ProjectHealthLabel;
  health_reasons: string[];
  overall_progress: number;
  current_phase_id: string | null;
  start_date: string;
  end_date: string;
  priority: Priority | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DashboardPhase = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  owner: ProjectLead | null;
  start_date: string | null;
  end_date: string | null;
  status: PhaseStatus;
  display_order: number;
  objectives: string | null;
  progress: number;
  budget_allocated: number;
  budget_spent: number;
  budget_remaining: number;
  budget_utilisation: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PhaseMutationPayload = {
  name: string;
  description: string | null;
  owner_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: PhaseStatus;
  display_order: number;
  objectives: string | null;
};

export type PhaseResponse = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  owner: ProjectLead | null;
  start_date: string | null;
  end_date: string | null;
  status: PhaseStatus;
  display_order: number;
  objectives: string | null;
  budget_allocated: number;
  budget_spent: number;
  budget_remaining: number;
  budget_utilisation: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type UpcomingDeadline = {
  entity_type: string;
  entity_id: string;
  name: string;
  deadline_date: string;
  phase_id: string | null;
  project_id: string;
};

export type DashboardDeliverable = {
  id: string;
  task_id: string;
  task_name: string;
  phase_id: string;
  phase_name: string;
  description: string;
  is_completed: boolean;
  display_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectDashboard = {
  project: DashboardProject;
  current_phase: DashboardPhase | null;
  upcoming_deadlines: UpcomingDeadline[];
  phases: DashboardPhase[];
  deliverables: DashboardDeliverable[];
  setup: ProjectSetup;
};

export type ProjectSetupStatus = "Complete" | "In Progress" | "Not Started" | "Not Applicable";

export type ProjectSetupSection = {
  key: string;
  label: string;
  status: ProjectSetupStatus;
  optional: boolean;
  live_items_count: number;
  live_source: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

export type ProjectSetupSummary = {
  complete_sections: number;
  total_applicable_sections: number;
  percent_complete: number;
};

export type ProjectSetupOverviewDetails = {
  name: string;
  code: string;
  description: string;
  project_lead: ProjectLead;
  start_date: string;
  end_date: string;
  project_location_area: string | null;
};

export type ProjectSetupScopeDetails = {
  scope_in: string | null;
  scope_out: string | null;
  scope_boundaries: string | null;
  scope_notes: string | null;
};

export type ProjectSetupObjectivesDetails = {
  objectives: string | null;
  expected_outcomes: string | null;
  success_criteria: string | null;
  key_indicators: string | null;
};

export type ProjectSetupWorkPlanDetails = {
  work_plan_details: string | null;
  planned_start: string;
  planned_completion: string;
  key_activities: string | null;
};

export type ProjectSetupBudgetDetails = {
  total_project_budget: number;
  budget_notes: string | null;
};

export type ProjectSetupDetails = {
  project_overview: ProjectSetupOverviewDetails;
  scope: ProjectSetupScopeDetails;
  objectives_outcomes: ProjectSetupObjectivesDetails;
  work_plan: ProjectSetupWorkPlanDetails;
};

export type ProjectSetup = {
  project_id: string;
  title: string;
  summary: ProjectSetupSummary;
  sections: ProjectSetupSection[];
  details: ProjectSetupDetails;
};

export type ProjectSetupSectionStatusPayload = {
  status: ProjectSetupStatus;
};

export type ProjectSetupDetailsSection = "project-overview" | "scope" | "objectives-outcomes" | "work-plan";

export type ProjectSetupDetailsPayload = Record<string, string | null>;

export type ProjectSetupBudgetPayload = {
  total_project_budget: number;
  budget_notes: string | null;
  phase_allocations: Array<{
    phase_id: string;
    allocated: number;
  }>;
};

export type ProjectSetupMilestone = {
  id: string;
  project_id: string;
  name: string;
  target_date: string;
  responsible_user_id: string | null;
  responsible_person: ProjectLead | null;
  status: "Not Started" | "In Progress" | "Complete";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSetupMilestonePayload = {
  name: string;
  target_date: string;
  responsible_user_id: string | null;
  status: "Not Started" | "In Progress" | "Complete";
};

export type ProjectSetupDeliverable = {
  id: string;
  task_id: string;
  task_name: string;
  phase_id: string;
  phase_name: string;
  description: string;
  owner_id: string | null;
  owner: ProjectLead | null;
  due_date: string | null;
  acceptance_criteria: string | null;
  approver_id: string | null;
  approver: ProjectLead | null;
  is_completed: boolean;
  display_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSetupDeliverablePayload = {
  task_id: string;
  description: string;
  owner_id: string | null;
  due_date: string | null;
  acceptance_criteria: string | null;
  approver_id: string | null;
};

export type ProjectSetupResourceType = "People" | "Equipment" | "Materials" | "Facilities" | "Technology" | "Other";

export type ProjectSetupResource = {
  id: string;
  project_id: string;
  resource_type: ProjectSetupResourceType;
  name: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSetupResourcePayload = {
  resource_type: ProjectSetupResourceType;
  name: string;
  notes: string | null;
};

export type ProjectSetupRiskIssueType = "Risk" | "Issue";
export type ProjectSetupRiskLevel = "Low" | "Medium" | "High";
export type ProjectSetupRiskStatus = "Open" | "In Progress" | "Mitigated" | "Closed";

export type ProjectSetupRiskIssue = {
  id: string;
  project_id: string;
  item_type: ProjectSetupRiskIssueType;
  title: string;
  likelihood: ProjectSetupRiskLevel;
  impact: ProjectSetupRiskLevel;
  mitigation: string | null;
  owner_id: string | null;
  owner: ProjectLead | null;
  status: ProjectSetupRiskStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSetupRiskIssuePayload = {
  item_type: ProjectSetupRiskIssueType;
  title: string;
  likelihood: ProjectSetupRiskLevel;
  impact: ProjectSetupRiskLevel;
  mitigation: string | null;
  owner_id: string | null;
  status: ProjectSetupRiskStatus;
};

export type ProjectSetupAssumptionConstraintType = "Assumption" | "Constraint";

export type ProjectSetupAssumptionConstraint = {
  id: string;
  project_id: string;
  entry_type: ProjectSetupAssumptionConstraintType;
  description: string;
  impact_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSetupAssumptionConstraintPayload = {
  entry_type: ProjectSetupAssumptionConstraintType;
  description: string;
  impact_notes: string | null;
};

export type ProjectSetupDependencyType = "Internal" | "External";

export type ProjectSetupDependency = {
  id: string;
  project_id: string;
  description: string;
  dependency_type: ProjectSetupDependencyType;
  related_phase_id: string | null;
  related_phase_name: string | null;
  related_task_id: string | null;
  related_task_name: string | null;
  responsible_user_id: string | null;
  responsible_person: ProjectLead | null;
  responsible_party: string | null;
  required_by_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSetupDependencyPayload = {
  description: string;
  dependency_type: ProjectSetupDependencyType;
  related_phase_id: string | null;
  related_task_id: string | null;
  responsible_user_id: string | null;
  responsible_party: string | null;
  required_by_date: string | null;
};

export type ProjectSetupStakeholder = {
  id: string;
  project_id: string;
  name: string;
  organisation_group: string | null;
  interest_role: string;
  influence_importance: string | null;
  engagement_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSetupStakeholderPayload = {
  name: string;
  organisation_group: string | null;
  interest_role: string;
  influence_importance: string | null;
  engagement_notes: string | null;
};

export type ProjectSetupCommunicationPlan = {
  id: string;
  project_id: string;
  audience: string;
  information: string;
  frequency: string;
  responsible_user_id: string | null;
  responsible_person: ProjectLead | null;
  method: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSetupCommunicationPlanPayload = {
  audience: string;
  information: string;
  frequency: string;
  responsible_user_id: string | null;
  method: string;
};

export type ProjectSetupMonitoringReporting = {
  id: string;
  project_id: string;
  monitored_item: string;
  reporting_frequency: string;
  responsible_user_id: string | null;
  responsible_person: ProjectLead | null;
  key_measures: string | null;
  reporting_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSetupMonitoringReportingPayload = {
  monitored_item: string;
  reporting_frequency: string;
  responsible_user_id: string | null;
  key_measures: string | null;
  reporting_notes: string | null;
};

export type SetupDocumentType = "Proposal" | "Contract / Agreement" | "Research Licence" | "Baseline" | "Inception" | "Middle Health" | "1st Draft Project Document" | "Final Draft" | "Other Documents" | "Terms of Reference" | "Baseline documents" | "Other supporting files";

export type ProjectSetupApproval = {
  id: string; project_id: string; required_approval: string; approver_id: string | null;
  approver: ProjectLead | null; due_date: string | null;
  status: "Required" | "Pending" | "Approved" | "Rejected" | "Not Required";
  approval_document_file_id: string | null; approval_document_name: string | null;
  created_by: string | null; created_at: string; updated_at: string;
};
export type ProjectSetupApprovalPayload = Omit<ProjectSetupApproval, "id" | "project_id" | "approver" | "approval_document_name" | "created_by" | "created_at" | "updated_at">;
export type ProjectSetupChange = { id: string; project_id: string; change_description: string; reason: string; approved_by_id: string | null; approved_by: ProjectLead | null; approved_date: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string };
export type ProjectSetupChangePayload = { change_description: string; reason: string; approved_by_id: string | null; approved_date: string | null; notes: string | null };
export type ProjectSetupSpecificInformation = { id: string; project_id: string; label: string; value: string; created_by: string | null; created_at: string; updated_at: string };
export type ProjectSetupSpecificInformationPayload = { label: string; value: string };
export type ProjectSetupNote = { id: string; project_id: string; note: string; created_by: string | null; created_at: string; updated_at: string };
export type ProjectSetupNotePayload = { note: string };
export type ProjectSetupDocumentCategory = { category: SetupDocumentType; status: ProjectSetupStatus; file_count: number };

export type Task = {
  id: string;
  project_id: string;
  phase_id: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner: ProjectLead;
  priority: Priority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskMutationPayload = {
  name: string;
  description: string | null;
  owner_id: string;
  priority: Priority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
};

export type TaskSupporter = {
  task_id: string;
  user_id: string;
  name: string;
  email: string;
  added_at: string;
};

export type MyWorkItem = {
  task_id: string;
  task_name: string;
  project_id: string;
  project_name: string;
  project_code: string;
  phase_id: string;
  phase_name: string;
  due_date: string | null;
  status: TaskStatus;
  relationship: "owner" | "supporter" | "owner_supporter";
  overdue: boolean;
  action_label: string | null;
};

export type AttentionItem = {
  type: "project" | "phase" | "task";
  reason: string;
  project_id: string;
  project_name: string;
  project_code: string;
  phase_id: string | null;
  phase_name: string | null;
  task_id: string | null;
  task_name: string | null;
  assigned_person: ProjectLead | null;
  due_date: string | null;
  severity: "Needs attention" | "At risk";
};

export type ProjectBudget = {
  project_id: string;
  allocated: number;
  spent: number;
  remaining: number;
  utilisation: number;
};

export type ProjectBudgetMutationPayload = {
  allocated?: number;
};

export type PhaseBudgetMutationPayload = {
  allocated?: number;
  spent?: number;
};

export type ChecklistSummary = {
  completed_items: number;
  total_items: number;
  progress: number;
};

export type ChecklistItem = {
  id: string;
  task_id: string;
  description: string;
  is_completed: boolean;
  display_order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Checklist = {
  task_id: string;
  summary: ChecklistSummary;
  items: ChecklistItem[];
};

export type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  author_name: string;
  author_email: string;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type CommentNotification = {
  id: string;
  project_id: string;
  project_name: string;
  phase_id: string;
  phase_name: string;
  task_id: string;
  task_name: string;
  commenter_name: string;
  comment: string;
  created_at: string;
};

export type TaskFile = {
  id: string;
  task_id: string;
  uploaded_by: string;
  uploader_name: string;
  uploader_email: string;
  file_name: string;
  file_type: string | null;
  file_size: number;
  file_category: "reference" | "work_submission" | "finance";
  setup_document_type?: SetupDocumentType | null;
  created_at: string;
};

export type ProjectFile = TaskFile & {
  project_id: string;
  phase_id: string;
  phase_name: string;
  task_name: string;
  folder_id?: string | null;
};

export type DownloadedTaskFile = {
  blob: Blob;
  fileName: string;
};

export type WorkspaceFolder = {
  id: string;
  project_id: string;
  parent_folder_id: string | null;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceFile = ProjectFile & {
  folder_id: string | null;
};

export type WorkspaceNativeResource = {
  id: string;
  project_id: string;
  folder_id: string | null;
  task_id: string | null;
  name: string;
  content: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceDocument = WorkspaceNativeResource;

export type WorkspaceSpreadsheet = WorkspaceNativeResource;

export type DocumentCollaborationSession = {
  resource_type: "document";
  project_id: string;
  resource_id: string;
  room: string;
  endpoint: string | null;
  ready: boolean;
  service: {
    configured: boolean;
    reachable: boolean;
    required: string[];
    url: string | null;
    detail: string | null;
  };
};

export type WorkspaceContents = {
  folders: WorkspaceFolder[];
  files: WorkspaceFile[];
  documents: WorkspaceDocument[];
  spreadsheets: WorkspaceSpreadsheet[];
};

export type WorkspaceFolderMutationPayload = {
  name?: string;
  parent_folder_id?: string | null;
};

export type WorkspaceFileMovePayload = {
  folder_id: string | null;
};

export type WorkspaceResourceKind = "documents" | "spreadsheets";

export type WorkspaceNativeResourceMutationPayload = {
  name: string;
  content: Record<string, unknown>;
  folder_id?: string | null;
  task_id?: string | null;
};

export type WorkspaceNativeResourceContentPayload = {
  content: Record<string, unknown>;
};

export type WorkspaceNativeResourceRenamePayload = {
  name: string;
};

export type WorkspaceNativeResourceMovePayload = {
  folder_id: string | null;
};

export type WorkspaceNativeResourceTaskLinkPayload = {
  task_id: string | null;
};
