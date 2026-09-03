import type { ProjectHealth } from "@/components/common/health-badge";
import type { PhaseStatus, Priority, ProjectStatus } from "@/components/common/status-badge";

export type ProjectSummary = {
  id: string;
  code: string;
  name: string;
  description: string;
  project_lead_id: string;
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
  joined_at: string;
};

export type ProjectLead = {
  id: string;
  name: string;
  email: string;
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
