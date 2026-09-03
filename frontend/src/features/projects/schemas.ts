import { z } from "zod";

import { projectHealthValues } from "@/components/common/health-badge";
import { phaseStatuses, priorities, projectStatuses, taskStatuses } from "@/components/common/status-badge";

const backendNumberSchema = z.union([z.number(), z.string()]).transform((value, context) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    context.addIssue({
      code: "custom",
      message: "Expected a numeric backend value.",
    });
    return z.NEVER;
  }

  return numberValue;
});

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

export const projectLeadSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
});

export const dashboardProjectSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  project_lead: projectLeadSchema,
  status: z.enum(projectStatuses),
  health: z.enum(projectHealthValues),
  health_color: z.string(),
  overall_progress: backendNumberSchema,
  current_phase_id: z.uuid().nullable(),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  priority: z.enum(priorities).nullable(),
  archived_at: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const dashboardPhaseSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  owner_id: z.uuid().nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  status: z.enum(phaseStatuses),
  display_order: z.number(),
  objectives: z.string().nullable(),
  progress: backendNumberSchema,
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  archived_at: z.string().nullable(),
});

export const phaseResponseSchema = dashboardPhaseSchema.omit({ progress: true });
export const phaseResponsesSchema = z.array(phaseResponseSchema);

export const upcomingDeadlineSchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.uuid(),
  name: z.string().min(1),
  deadline_date: z.string().min(1),
  phase_id: z.uuid().nullable(),
  project_id: z.uuid(),
});

export const dashboardDeliverableSchema = z.object({
  id: z.uuid(),
  task_id: z.uuid(),
  task_name: z.string().min(1),
  phase_id: z.uuid(),
  phase_name: z.string().min(1),
  description: z.string().min(1),
  is_completed: z.boolean(),
  display_order: z.number(),
  completed_at: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectDashboardSchema = z.object({
  project: dashboardProjectSchema,
  current_phase: dashboardPhaseSchema.nullable(),
  upcoming_deadlines: z.array(upcomingDeadlineSchema),
  phases: z.array(dashboardPhaseSchema),
  deliverables: z.array(dashboardDeliverableSchema),
});

export const taskSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  phase_id: z.uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  owner_id: z.uuid(),
  priority: z.enum(priorities),
  status: z.enum(taskStatuses),
  start_date: z.string().nullable(),
  due_date: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const tasksSchema = z.array(taskSchema);

export const taskSupporterSchema = z.object({
  task_id: z.uuid(),
  user_id: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
  added_at: z.string().min(1),
});

export const taskSupportersSchema = z.array(taskSupporterSchema);

export const checklistSummarySchema = z.object({
  completed_items: z.number(),
  total_items: z.number(),
  progress: backendNumberSchema,
});

export const checklistItemSchema = z.object({
  id: z.uuid(),
  task_id: z.uuid(),
  description: z.string().min(1),
  is_completed: z.boolean(),
  display_order: z.number(),
  completed_at: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const checklistSchema = z.object({
  task_id: z.uuid(),
  summary: checklistSummarySchema,
  items: z.array(checklistItemSchema),
});

export const taskCommentSchema = z.object({
  id: z.uuid(),
  task_id: z.uuid(),
  user_id: z.uuid(),
  author_name: z.string().min(1),
  author_email: z.email(),
  comment: z.string().min(1),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const taskCommentsSchema = z.array(taskCommentSchema);

export const taskFileSchema = z.object({
  id: z.uuid(),
  task_id: z.uuid(),
  uploaded_by: z.uuid(),
  uploader_name: z.string().min(1),
  uploader_email: z.email(),
  file_name: z.string().min(1),
  storage_key: z.string().min(1),
  file_type: z.string().nullable(),
  file_size: z.number(),
  created_at: z.string().min(1),
});

export const taskFilesSchema = z.array(taskFileSchema);
