import { z } from "zod";

import { projectHealthLabelValues, projectHealthValues } from "@/components/common/health-badge";
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

export const userSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
});

export const projectSummarySchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  project_lead_id: z.uuid(),
  project_lead: userSummarySchema,
  current_phase_id: z.uuid().nullable(),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  status: z.enum(projectStatuses),
  health: z.enum(projectHealthValues),
  health_color: z.string(),
  health_label: z.enum(projectHealthLabelValues),
  health_reasons: z.array(z.string()),
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
  role: z.enum(["PM", "Team Member", "Finance"]),
  joined_at: z.string().min(1),
});

export const projectMembersSchema = z.array(projectMemberSchema);

export const phaseMemberSchema = z.object({
  phase_id: z.uuid(),
  user_id: z.uuid(),
  name: z.string().min(1),
  email: z.email(),
  added_at: z.string().min(1),
});

export const phaseMembersSchema = z.array(phaseMemberSchema);

export const projectLeadSchema = userSummarySchema;

export const dashboardProjectSchema = z.object({
  id: z.uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  project_lead: projectLeadSchema,
  status: z.enum(projectStatuses),
  health: z.enum(projectHealthValues),
  health_color: z.string(),
  health_label: z.enum(projectHealthLabelValues),
  health_reasons: z.array(z.string()),
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
  owner: userSummarySchema.nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  status: z.enum(phaseStatuses),
  display_order: z.number(),
  objectives: z.string().nullable(),
  progress: backendNumberSchema,
  budget_allocated: backendNumberSchema,
  budget_spent: backendNumberSchema,
  budget_remaining: backendNumberSchema,
  budget_utilisation: backendNumberSchema,
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

export const projectSetupStatusSchema = z.enum(["Complete", "In Progress", "Not Started", "Not Applicable"]);

export const projectSetupSectionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  status: projectSetupStatusSchema,
  optional: z.boolean(),
  live_items_count: z.number(),
  live_source: z.string().nullable(),
  updated_by: z.uuid().nullable(),
  updated_at: z.string().nullable(),
});

export const projectSetupDetailsSchema = z.object({
  project_overview: z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    description: z.string().min(1),
    project_lead: userSummarySchema,
    start_date: z.string().min(1),
    end_date: z.string().min(1),
    project_location_area: z.string().nullable(),
  }),
  scope: z.object({
    scope_in: z.string().nullable(),
    scope_out: z.string().nullable(),
    scope_boundaries: z.string().nullable(),
    scope_notes: z.string().nullable(),
  }),
  objectives_outcomes: z.object({
    objectives: z.string().nullable(),
    expected_outcomes: z.string().nullable(),
    success_criteria: z.string().nullable(),
    key_indicators: z.string().nullable(),
  }),
  work_plan: z.object({
    work_plan_details: z.string().nullable(),
    planned_start: z.string().min(1),
    planned_completion: z.string().min(1),
    key_activities: z.string().nullable(),
  }),
});

export const projectSetupSchema = z.object({
  project_id: z.uuid(),
  title: z.string().min(1),
  summary: z.object({
    complete_sections: z.number(),
    total_applicable_sections: z.number(),
    percent_complete: z.number(),
  }),
  sections: z.array(projectSetupSectionSchema),
  details: projectSetupDetailsSchema,
});

export const projectSetupBudgetSchema = z.object({
  total_project_budget: backendNumberSchema,
  budget_notes: z.string().nullable(),
});

export const projectSetupMilestoneSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  name: z.string().min(1),
  target_date: z.string().min(1),
  responsible_user_id: z.uuid().nullable(),
  responsible_person: userSummarySchema.nullable(),
  status: z.enum(["Not Started", "In Progress", "Complete"]),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectSetupDeliverableSchema = z.object({
  id: z.uuid(),
  task_id: z.uuid(),
  task_name: z.string().min(1),
  phase_id: z.uuid(),
  phase_name: z.string().min(1),
  description: z.string().min(1),
  owner_id: z.uuid().nullable(),
  owner: userSummarySchema.nullable(),
  due_date: z.string().nullable(),
  acceptance_criteria: z.string().nullable(),
  approver_id: z.uuid().nullable(),
  approver: userSummarySchema.nullable(),
  is_completed: z.boolean(),
  display_order: z.number(),
  completed_at: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectSetupResourceSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  resource_type: z.enum(["People", "Equipment", "Materials", "Facilities", "Technology", "Other"]),
  name: z.string().min(1),
  notes: z.string().nullable(),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectSetupRiskIssueSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  item_type: z.enum(["Risk", "Issue"]),
  title: z.string().min(1),
  likelihood: z.enum(["Low", "Medium", "High"]),
  impact: z.enum(["Low", "Medium", "High"]),
  mitigation: z.string().nullable(),
  owner_id: z.uuid().nullable(),
  owner: userSummarySchema.nullable(),
  status: z.enum(["Open", "In Progress", "Mitigated", "Closed"]),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectSetupAssumptionConstraintSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  entry_type: z.enum(["Assumption", "Constraint"]),
  description: z.string().min(1),
  impact_notes: z.string().nullable(),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectSetupDependencySchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  description: z.string().min(1),
  dependency_type: z.enum(["Internal", "External"]),
  related_phase_id: z.uuid().nullable(),
  related_phase_name: z.string().nullable(),
  related_task_id: z.uuid().nullable(),
  related_task_name: z.string().nullable(),
  responsible_user_id: z.uuid().nullable(),
  responsible_person: userSummarySchema.nullable(),
  responsible_party: z.string().nullable(),
  required_by_date: z.string().nullable(),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectSetupStakeholderSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  name: z.string().min(1),
  organisation_group: z.string().nullable(),
  interest_role: z.string().min(1),
  influence_importance: z.string().nullable(),
  engagement_notes: z.string().nullable(),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectSetupCommunicationPlanSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  audience: z.string().min(1),
  information: z.string().min(1),
  frequency: z.string().min(1),
  responsible_user_id: z.uuid().nullable(),
  responsible_person: userSummarySchema.nullable(),
  method: z.string().min(1),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectSetupMonitoringReportingSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  monitored_item: z.string().min(1),
  reporting_frequency: z.string().min(1),
  responsible_user_id: z.uuid().nullable(),
  responsible_person: userSummarySchema.nullable(),
  key_measures: z.string().nullable(),
  reporting_notes: z.string().nullable(),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const projectSetupMilestonesSchema = z.array(projectSetupMilestoneSchema);
export const projectSetupDeliverablesSchema = z.array(projectSetupDeliverableSchema);
export const projectSetupResourcesSchema = z.array(projectSetupResourceSchema);
export const projectSetupRisksIssuesSchema = z.array(projectSetupRiskIssueSchema);
export const projectSetupAssumptionsConstraintsSchema = z.array(projectSetupAssumptionConstraintSchema);
export const projectSetupDependenciesSchema = z.array(projectSetupDependencySchema);
export const projectSetupStakeholdersSchema = z.array(projectSetupStakeholderSchema);
export const projectSetupCommunicationPlansSchema = z.array(projectSetupCommunicationPlanSchema);
export const projectSetupMonitoringReportingsSchema = z.array(projectSetupMonitoringReportingSchema);
export const projectSetupApprovalSchema = z.object({ id: z.uuid(), project_id: z.uuid(), required_approval: z.string().min(1), approver_id: z.uuid().nullable(), approver: userSummarySchema.nullable(), due_date: z.string().nullable(), status: z.enum(["Required", "Pending", "Approved", "Rejected", "Not Required"]), approval_document_file_id: z.uuid().nullable(), approval_document_name: z.string().nullable(), created_by: z.uuid().nullable(), created_at: z.string().min(1), updated_at: z.string().min(1) });
export const projectSetupApprovalsSchema = z.array(projectSetupApprovalSchema);
export const projectSetupChangeSchema = z.object({ id: z.uuid(), project_id: z.uuid(), change_description: z.string().min(1), reason: z.string().min(1), approved_by_id: z.uuid().nullable(), approved_by: userSummarySchema.nullable(), approved_date: z.string().nullable(), notes: z.string().nullable(), created_by: z.uuid().nullable(), created_at: z.string().min(1), updated_at: z.string().min(1) });
export const projectSetupChangesSchema = z.array(projectSetupChangeSchema);
export const projectSetupSpecificInformationSchema = z.object({ id: z.uuid(), project_id: z.uuid(), label: z.string().min(1), value: z.string().min(1), created_by: z.uuid().nullable(), created_at: z.string().min(1), updated_at: z.string().min(1) });
export const projectSetupSpecificInformationSchemaArray = z.array(projectSetupSpecificInformationSchema);
export const projectSetupNoteSchema = z.object({ id: z.uuid(), project_id: z.uuid(), note: z.string().min(1), created_by: z.uuid().nullable(), created_at: z.string().min(1), updated_at: z.string().min(1) });
export const projectSetupNotesSchema = z.array(projectSetupNoteSchema);

export const projectDashboardSchema = z.object({
  project: dashboardProjectSchema,
  current_phase: dashboardPhaseSchema.nullable(),
  upcoming_deadlines: z.array(upcomingDeadlineSchema),
  phases: z.array(dashboardPhaseSchema),
  deliverables: z.array(dashboardDeliverableSchema),
  setup: projectSetupSchema,
});

export const taskSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  phase_id: z.uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  owner_id: z.uuid(),
  owner: userSummarySchema,
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

export const myWorkItemSchema = z.object({
  task_id: z.uuid(),
  task_name: z.string().min(1),
  project_id: z.uuid(),
  project_name: z.string().min(1),
  project_code: z.string().min(1),
  phase_id: z.uuid(),
  phase_name: z.string().min(1),
  due_date: z.string().nullable(),
  status: z.enum(taskStatuses),
  relationship: z.enum(["owner", "supporter", "owner_supporter"]),
  overdue: z.boolean(),
  action_label: z.string().nullable(),
});

export const myWorkItemsSchema = z.array(myWorkItemSchema);

export const attentionItemSchema = z.object({
  type: z.enum(["project", "phase", "task"]),
  reason: z.string().min(1),
  project_id: z.uuid(),
  project_name: z.string().min(1),
  project_code: z.string().min(1),
  phase_id: z.uuid().nullable(),
  phase_name: z.string().nullable(),
  task_id: z.uuid().nullable(),
  task_name: z.string().nullable(),
  assigned_person: userSummarySchema.nullable(),
  due_date: z.string().nullable(),
  severity: z.enum(["Needs attention", "At risk"]),
});

export const attentionItemsSchema = z.array(attentionItemSchema);

export const projectBudgetSchema = z.object({
  project_id: z.uuid(),
  allocated: backendNumberSchema,
  spent: backendNumberSchema,
  remaining: backendNumberSchema,
  utilisation: backendNumberSchema,
});

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
  file_type: z.string().nullable(),
  file_size: z.number(),
  file_category: z.enum(["reference", "work_submission", "finance"]),
  setup_document_type: z.enum(["Proposal", "Contract / Agreement", "Terms of Reference", "Baseline documents", "Other supporting files"]).nullable().optional(),
  created_at: z.string().min(1),
});

export const taskFilesSchema = z.array(taskFileSchema);

export const projectFileSchema = taskFileSchema.extend({
  project_id: z.uuid(),
  phase_id: z.uuid(),
  phase_name: z.string().min(1),
  task_name: z.string().min(1),
  folder_id: z.uuid().nullable().optional(),
});

export const projectFilesSchema = z.array(projectFileSchema);

export const workspaceFolderSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  parent_folder_id: z.uuid().nullable(),
  name: z.string().min(1),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const workspaceFileSchema = projectFileSchema.extend({
  folder_id: z.uuid().nullable(),
});

export const workspaceNativeResourceSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  folder_id: z.uuid().nullable(),
  task_id: z.uuid().nullable(),
  name: z.string().min(1),
  content: z.record(z.string(), z.unknown()),
  created_by: z.uuid().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const workspaceNativeResourcesSchema = z.array(workspaceNativeResourceSchema);

export const workspaceContentsSchema = z.object({
  folders: z.array(workspaceFolderSchema),
  files: z.array(workspaceFileSchema),
  documents: z.array(workspaceNativeResourceSchema).default([]),
  spreadsheets: z.array(workspaceNativeResourceSchema).default([]),
});
