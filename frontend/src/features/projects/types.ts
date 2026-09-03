import type { ProjectHealth } from "@/components/common/health-badge";
import type { Priority, ProjectStatus } from "@/components/common/status-badge";

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
