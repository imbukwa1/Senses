import type { ProjectHealth } from "@/components/common/health-badge";
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
  project_lead_id: string;
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
};

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

export type TaskFile = {
  id: string;
  task_id: string;
  uploaded_by: string;
  uploader_name: string;
  uploader_email: string;
  file_name: string;
  file_type: string | null;
  file_size: number;
  file_category: "reference" | "work_submission";
  created_at: string;
};

export type DownloadedTaskFile = {
  blob: Blob;
  fileName: string;
};
