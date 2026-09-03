import { z } from "zod";

import { projectHealthValues } from "@/components/common/health-badge";
import { priorities, projectStatuses } from "@/components/common/status-badge";

export const projectSummarySchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  project_lead_id: z.uuid(),
  current_phase_id: z.uuid().nullable(),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  status: z.enum(projectStatuses),
  health: z.enum(projectHealthValues),
  health_color: z.string(),
  funder_partner: z.string().nullable(),
  project_type: z.string().nullable(),
  objectives: z.string().nullable(),
  priority: z.enum(priorities).nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  archived_at: z.string().nullable(),
});

export const projectSummariesSchema = z.array(projectSummarySchema);

export const projectMemberSchema = z.object({
  project_id: z.uuid(),
  user_id: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
  joined_at: z.string().min(1),
});

export const projectMembersSchema = z.array(projectMemberSchema);
