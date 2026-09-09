import { ApiError, apiRequest } from "@/features/auth/api";
import { env } from "@/lib/env";

import {
  attentionItemsSchema,
  phaseResponseSchema,
  phaseResponsesSchema,
  phaseMemberSchema,
  phaseMembersSchema,
  checklistItemSchema,
  checklistSchema,
  myWorkItemsSchema,
  projectBudgetSchema,
  projectDashboardSchema,
  projectFilesSchema,
  projectMemberSchema,
  projectMembersSchema,
  projectSetupBudgetSchema,
  projectSetupAssumptionConstraintSchema,
  projectSetupAssumptionsConstraintsSchema,
  projectSetupCommunicationPlanSchema,
  projectSetupCommunicationPlansSchema,
  projectSetupDependencySchema,
  projectSetupDependenciesSchema,
  projectSetupDeliverableSchema,
  projectSetupDeliverablesSchema,
  projectSetupMilestoneSchema,
  projectSetupMilestonesSchema,
  projectSetupMonitoringReportingSchema,
  projectSetupMonitoringReportingsSchema,
  projectSetupApprovalSchema,
  projectSetupApprovalsSchema,
  projectSetupChangeSchema,
  projectSetupChangesSchema,
  projectSetupSpecificInformationSchema,
  projectSetupSpecificInformationSchemaArray,
  projectSetupNoteSchema,
  projectSetupNotesSchema,
  projectSetupDocumentCategoriesSchema,
  projectSetupDocumentCategorySchema,
  projectSetupRiskIssueSchema,
  projectSetupRisksIssuesSchema,
  projectSetupResourceSchema,
  projectSetupResourcesSchema,
  projectSetupStakeholderSchema,
  projectSetupStakeholdersSchema,
  projectSetupSchema,
  projectSummariesSchema,
  projectSummarySchema,
  taskSchema,
  taskCommentSchema,
  taskCommentsSchema,
  commentNotificationsSchema,
  taskFileSchema,
  taskFilesSchema,
  taskSupporterSchema,
  taskSupportersSchema,
  tasksSchema,
  workspaceContentsSchema,
  workspaceFolderSchema,
  workspaceFileSchema,
  workspaceNativeResourceSchema,
  workspaceNativeResourcesSchema,
} from "./schemas";
import type {
  PhaseMutationPayload,
  AttentionItem,
  PhaseBudgetMutationPayload,
  PhaseMember,
  MyWorkItem,
  ProjectFile,
  ProjectBudget,
  ProjectBudgetMutationPayload,
  PhaseResponse,
  ProjectDashboard,
  ProjectSetupAssumptionConstraint,
  ProjectSetupAssumptionConstraintPayload,
  ProjectSetupBudgetDetails,
  ProjectSetupCommunicationPlan,
  ProjectSetupCommunicationPlanPayload,
  ProjectSetupDetailsPayload,
  ProjectSetupDetailsSection,
  ProjectSetupBudgetPayload,
  ProjectSetupDependency,
  ProjectSetupDependencyPayload,
  ProjectSetupDeliverable,
  ProjectSetupDeliverablePayload,
  ProjectSetupMilestone,
  ProjectSetupMilestonePayload,
  ProjectSetupRiskIssue,
  ProjectSetupRiskIssuePayload,
  ProjectSetupResource,
  ProjectSetupResourcePayload,
  ProjectSetupMonitoringReporting,
  ProjectSetupMonitoringReportingPayload,
  ProjectSetupApproval,
  ProjectSetupApprovalPayload,
  ProjectSetupChange,
  ProjectSetupChangePayload,
  ProjectSetupSpecificInformation,
  ProjectSetupSpecificInformationPayload,
  ProjectSetupNote,
  ProjectSetupNotePayload,
  ProjectSetupDocumentCategory,
  ProjectMember,
  ProjectMutationPayload,
  ProjectSetup,
  ProjectSetupSectionStatusPayload,
  ProjectSetupStakeholder,
  ProjectSetupStakeholderPayload,
  ProjectSummary,
  Task,
  Checklist,
  ChecklistItem,
  TaskComment,
  CommentNotification,
  DownloadedTaskFile,
  TaskFile,
  TaskMutationPayload,
  TaskSupporter,
  WorkspaceContents,
  WorkspaceFile,
  WorkspaceFileMovePayload,
  WorkspaceFolder,
  WorkspaceFolderMutationPayload,
  WorkspaceNativeResource,
  WorkspaceNativeResourceContentPayload,
  WorkspaceNativeResourceMovePayload,
  WorkspaceNativeResourceMutationPayload,
  WorkspaceNativeResourceRenamePayload,
  WorkspaceNativeResourceTaskLinkPayload,
  WorkspaceResourceKind,
} from "./types";

export async function listProjects(token: string): Promise<ProjectSummary[]> {
  const data = await apiRequest<unknown>("/projects", {}, token);
  const result = projectSummariesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project data could not be loaded.", 500);
  }

  return result.data;
}

export async function listAttention(token: string): Promise<AttentionItem[]> {
  const data = await apiRequest<unknown>("/attention", {}, token);
  const result = attentionItemsSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Attention data could not be loaded.", 500);
  }

  return result.data;
}

export async function listMyWork(token: string): Promise<MyWorkItem[]> {
  const data = await apiRequest<unknown>("/my-work", {}, token);
  const result = myWorkItemsSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("My Work data could not be loaded.", 500);
  }

  return result.data;
}

export async function getProject(token: string, projectId: string): Promise<ProjectSummary> {
  const data = await apiRequest<unknown>(`/projects/${projectId}`, {}, token);
  return parseProject(data);
}

export async function getProjectDashboard(token: string, projectId: string): Promise<ProjectDashboard> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/dashboard`, {}, token);
  const result = projectDashboardSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project dashboard data could not be loaded.", 500);
  }

  return result.data;
}

export async function getProjectSetup(token: string, projectId: string): Promise<ProjectSetup> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup`, {}, token);
  const result = projectSetupSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup data could not be loaded.", 500);
  }

  return result.data;
}

export async function getProjectSetupBudget(token: string, projectId: string): Promise<ProjectSetupBudgetDetails> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/budget`, {}, token);
  const result = projectSetupBudgetSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup budget data could not be loaded.", 500);
  }

  return result.data;
}

export async function listProjectSetupMilestones(token: string, projectId: string): Promise<ProjectSetupMilestone[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/milestones`, {}, token);
  const result = projectSetupMilestonesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup milestones could not be loaded.", 500);
  }

  return result.data;
}

export async function createProjectSetupMilestone(
  token: string,
  projectId: string,
  payload: ProjectSetupMilestonePayload,
): Promise<ProjectSetupMilestone> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/milestones`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupMilestoneSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup milestone could not be saved.", 500);
  }

  return result.data;
}

export async function listProjectSetupDeliverables(token: string, projectId: string): Promise<ProjectSetupDeliverable[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/deliverables`, {}, token);
  const result = projectSetupDeliverablesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup deliverables could not be loaded.", 500);
  }

  return result.data;
}

export async function createProjectSetupDeliverable(
  token: string,
  projectId: string,
  payload: ProjectSetupDeliverablePayload,
): Promise<ProjectSetupDeliverable> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/deliverables`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupDeliverableSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup deliverable could not be saved.", 500);
  }

  return result.data;
}

export async function listProjectSetupResources(token: string, projectId: string): Promise<ProjectSetupResource[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/resources`, {}, token);
  const result = projectSetupResourcesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup resources could not be loaded.", 500);
  }

  return result.data;
}

export async function createProjectSetupResource(
  token: string,
  projectId: string,
  payload: ProjectSetupResourcePayload,
): Promise<ProjectSetupResource> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/resources`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupResourceSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup resource could not be saved.", 500);
  }

  return result.data;
}

export async function listProjectSetupApprovals(token: string, projectId: string): Promise<ProjectSetupApproval[]> {
  const result = projectSetupApprovalsSchema.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/approvals`, {}, token));
  if (!result.success) throw new ApiError("Project approvals could not be loaded.", 500);
  return result.data;
}
export async function createProjectSetupApproval(token: string, projectId: string, payload: ProjectSetupApprovalPayload): Promise<ProjectSetupApproval> {
  const result = projectSetupApprovalSchema.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/approvals`, { method: "POST", body: JSON.stringify(payload) }, token));
  if (!result.success) throw new ApiError("Project approval could not be saved.", 500);
  return result.data;
}
export async function listProjectSetupChanges(token: string, projectId: string): Promise<ProjectSetupChange[]> {
  const result = projectSetupChangesSchema.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/changes`, {}, token));
  if (!result.success) throw new ApiError("Project changes could not be loaded.", 500);
  return result.data;
}
export async function createProjectSetupChange(token: string, projectId: string, payload: ProjectSetupChangePayload): Promise<ProjectSetupChange> {
  const result = projectSetupChangeSchema.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/changes`, { method: "POST", body: JSON.stringify(payload) }, token));
  if (!result.success) throw new ApiError("Project change could not be saved.", 500);
  return result.data;
}
export async function listProjectSetupSpecificInformation(token: string, projectId: string): Promise<ProjectSetupSpecificInformation[]> {
  const result = projectSetupSpecificInformationSchemaArray.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/project-specific-information`, {}, token));
  if (!result.success) throw new ApiError("Project-specific information could not be loaded.", 500);
  return result.data;
}
export async function createProjectSetupSpecificInformation(token: string, projectId: string, payload: ProjectSetupSpecificInformationPayload): Promise<ProjectSetupSpecificInformation> {
  const result = projectSetupSpecificInformationSchema.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/project-specific-information`, { method: "POST", body: JSON.stringify(payload) }, token));
  if (!result.success) throw new ApiError("Project-specific information could not be saved.", 500);
  return result.data;
}
export async function listProjectSetupNotes(token: string, projectId: string): Promise<ProjectSetupNote[]> {
  const result = projectSetupNotesSchema.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/notes`, {}, token));
  if (!result.success) throw new ApiError("Project setup notes could not be loaded.", 500);
  return result.data;
}
export async function createProjectSetupNote(token: string, projectId: string, payload: ProjectSetupNotePayload): Promise<ProjectSetupNote> {
  const result = projectSetupNoteSchema.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/notes`, { method: "POST", body: JSON.stringify(payload) }, token));
  if (!result.success) throw new ApiError("Project setup note could not be saved.", 500);
  return result.data;
}

export async function listProjectSetupDocumentCategories(token: string, projectId: string): Promise<ProjectSetupDocumentCategory[]> {
  const result = projectSetupDocumentCategoriesSchema.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/document-categories`, {}, token));
  if (!result.success) throw new ApiError("Project document categories could not be loaded.", 500);
  return result.data;
}
export async function updateProjectSetupDocumentCategory(token: string, projectId: string, category: string, status: ProjectSetupDocumentCategory["status"]): Promise<ProjectSetupDocumentCategory> {
  const result = projectSetupDocumentCategorySchema.safeParse(await apiRequest<unknown>(`/projects/${projectId}/setup/document-categories/${encodeURIComponent(category)}`, { method: "PATCH", body: JSON.stringify({ status }) }, token));
  if (!result.success) throw new ApiError("Project document category could not be saved.", 500);
  return result.data;
}

export async function listProjectSetupRisksIssues(token: string, projectId: string): Promise<ProjectSetupRiskIssue[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/risks-issues`, {}, token);
  const result = projectSetupRisksIssuesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup risks and issues could not be loaded.", 500);
  }

  return result.data;
}

export async function createProjectSetupRiskIssue(
  token: string,
  projectId: string,
  payload: ProjectSetupRiskIssuePayload,
): Promise<ProjectSetupRiskIssue> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/risks-issues`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupRiskIssueSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup risk or issue could not be saved.", 500);
  }

  return result.data;
}

export async function listProjectSetupAssumptionsConstraints(token: string, projectId: string): Promise<ProjectSetupAssumptionConstraint[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/assumptions-constraints`, {}, token);
  const result = projectSetupAssumptionsConstraintsSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup assumptions and constraints could not be loaded.", 500);
  }

  return result.data;
}

export async function createProjectSetupAssumptionConstraint(
  token: string,
  projectId: string,
  payload: ProjectSetupAssumptionConstraintPayload,
): Promise<ProjectSetupAssumptionConstraint> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/assumptions-constraints`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupAssumptionConstraintSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup assumption or constraint could not be saved.", 500);
  }

  return result.data;
}

export async function listProjectSetupDependencies(token: string, projectId: string): Promise<ProjectSetupDependency[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/dependencies`, {}, token);
  const result = projectSetupDependenciesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup dependencies could not be loaded.", 500);
  }

  return result.data;
}

export async function createProjectSetupDependency(
  token: string,
  projectId: string,
  payload: ProjectSetupDependencyPayload,
): Promise<ProjectSetupDependency> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/dependencies`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupDependencySchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup dependency could not be saved.", 500);
  }

  return result.data;
}

export async function listProjectSetupStakeholders(token: string, projectId: string): Promise<ProjectSetupStakeholder[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/stakeholders`, {}, token);
  const result = projectSetupStakeholdersSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup stakeholders could not be loaded.", 500);
  }

  return result.data;
}

export async function createProjectSetupStakeholder(
  token: string,
  projectId: string,
  payload: ProjectSetupStakeholderPayload,
): Promise<ProjectSetupStakeholder> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/stakeholders`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupStakeholderSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup stakeholder could not be saved.", 500);
  }

  return result.data;
}

export async function listProjectSetupCommunicationPlan(token: string, projectId: string): Promise<ProjectSetupCommunicationPlan[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/communication-plan`, {}, token);
  const result = projectSetupCommunicationPlansSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup communication plan could not be loaded.", 500);
  }

  return result.data;
}

export async function createProjectSetupCommunicationPlan(
  token: string,
  projectId: string,
  payload: ProjectSetupCommunicationPlanPayload,
): Promise<ProjectSetupCommunicationPlan> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/communication-plan`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupCommunicationPlanSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup communication plan item could not be saved.", 500);
  }

  return result.data;
}

export async function listProjectSetupMonitoringReporting(token: string, projectId: string): Promise<ProjectSetupMonitoringReporting[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/setup/monitoring-reporting`, {}, token);
  const result = projectSetupMonitoringReportingsSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup monitoring and reporting could not be loaded.", 500);
  }

  return result.data;
}

export async function createProjectSetupMonitoringReporting(
  token: string,
  projectId: string,
  payload: ProjectSetupMonitoringReportingPayload,
): Promise<ProjectSetupMonitoringReporting> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/monitoring-reporting`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupMonitoringReportingSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup monitoring and reporting item could not be saved.", 500);
  }

  return result.data;
}

export async function getProjectBudget(token: string, projectId: string): Promise<ProjectBudget> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/budget`, {}, token);
  const result = projectBudgetSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project budget data could not be loaded.", 500);
  }

  return result.data;
}

export async function listProjectFiles(token: string, projectId: string): Promise<ProjectFile[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/files`, {}, token);
  const result = projectFilesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project file data could not be loaded.", 500);
  }

  return result.data;
}

export async function downloadProjectFile(token: string, projectId: string, fileId: string): Promise<DownloadedTaskFile> {
  const response = await fetch(`${apiBaseUrl()}/projects/${projectId}/files/${fileId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await safeFileErrorMessage(response), response.status);
  }

  return {
    blob: await response.blob(),
    fileName: parseDownloadFileName(response.headers.get("content-disposition")) ?? "attachment",
  };
}

export async function deleteProjectFile(token: string, projectId: string, fileId: string): Promise<void> {
  await apiRequest<void>(`/projects/${projectId}/files/${fileId}`, { method: "DELETE" }, token);
}

export async function getWorkspaceContents(token: string, projectId: string, folderId: string | null = null): Promise<WorkspaceContents> {
  const path = folderId ? `/projects/${projectId}/workspace/folders/${folderId}` : `/projects/${projectId}/workspace`;
  const data = await apiRequest<unknown>(path, {}, token);
  const result = workspaceContentsSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Workspace data could not be loaded.", 500);
  }

  return result.data;
}

export async function createWorkspaceFolder(token: string, projectId: string, payload: WorkspaceFolderMutationPayload): Promise<WorkspaceFolder> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/workspace/folders`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseWorkspaceFolder(data);
}

export async function updateWorkspaceFolder(
  token: string,
  projectId: string,
  folderId: string,
  payload: WorkspaceFolderMutationPayload,
): Promise<WorkspaceFolder> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/workspace/folders/${folderId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseWorkspaceFolder(data);
}

export async function deleteWorkspaceFolder(token: string, projectId: string, folderId: string): Promise<void> {
  await apiRequest<void>(
    `/projects/${projectId}/workspace/folders/${folderId}`,
    {
      method: "DELETE",
    },
    token,
  );
}

export async function moveWorkspaceFile(
  token: string,
  projectId: string,
  fileId: string,
  payload: WorkspaceFileMovePayload,
): Promise<WorkspaceFile> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/workspace/files/${fileId}/folder`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = workspaceFileSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Workspace file data could not be loaded.", 500);
  }

  return result.data;
}

export async function listWorkspaceNativeResources(token: string, projectId: string, kind: WorkspaceResourceKind): Promise<WorkspaceNativeResource[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/workspace/${kind}`, {}, token);
  const result = workspaceNativeResourcesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Workspace resource data could not be loaded.", 500);
  }

  return result.data;
}

export async function getWorkspaceNativeResource(token: string, projectId: string, kind: WorkspaceResourceKind, resourceId: string): Promise<WorkspaceNativeResource> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/workspace/${kind}/${resourceId}`, {}, token);
  return parseWorkspaceNativeResource(data);
}

export async function createWorkspaceNativeResource(
  token: string,
  projectId: string,
  kind: WorkspaceResourceKind,
  payload: WorkspaceNativeResourceMutationPayload,
): Promise<WorkspaceNativeResource> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/workspace/${kind}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseWorkspaceNativeResource(data);
}

export async function updateWorkspaceNativeResourceContent(
  token: string,
  projectId: string,
  kind: WorkspaceResourceKind,
  resourceId: string,
  payload: WorkspaceNativeResourceContentPayload,
): Promise<WorkspaceNativeResource> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/workspace/${kind}/${resourceId}/content`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseWorkspaceNativeResource(data);
}

export async function renameWorkspaceNativeResource(
  token: string,
  projectId: string,
  kind: WorkspaceResourceKind,
  resourceId: string,
  payload: WorkspaceNativeResourceRenamePayload,
): Promise<WorkspaceNativeResource> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/workspace/${kind}/${resourceId}/name`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseWorkspaceNativeResource(data);
}

export async function moveWorkspaceNativeResource(
  token: string,
  projectId: string,
  kind: WorkspaceResourceKind,
  resourceId: string,
  payload: WorkspaceNativeResourceMovePayload,
): Promise<WorkspaceNativeResource> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/workspace/${kind}/${resourceId}/folder`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseWorkspaceNativeResource(data);
}

export async function updateWorkspaceNativeResourceTaskLink(
  token: string,
  projectId: string,
  kind: WorkspaceResourceKind,
  resourceId: string,
  payload: WorkspaceNativeResourceTaskLinkPayload,
): Promise<WorkspaceNativeResource> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/workspace/${kind}/${resourceId}/task-link`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseWorkspaceNativeResource(data);
}

export async function deleteWorkspaceNativeResource(token: string, projectId: string, kind: WorkspaceResourceKind, resourceId: string): Promise<void> {
  await apiRequest<void>(
    `/projects/${projectId}/workspace/${kind}/${resourceId}`,
    {
      method: "DELETE",
    },
    token,
  );
}

export async function updateProjectBudget(token: string, projectId: string, payload: ProjectBudgetMutationPayload): Promise<ProjectBudget> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/budget`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectBudgetSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project budget data could not be loaded.", 500);
  }

  return result.data;
}

export async function updateProjectSetupSection(
  token: string,
  projectId: string,
  sectionKey: string,
  payload: ProjectSetupSectionStatusPayload,
): Promise<ProjectSetup> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/sections/${sectionKey}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup data could not be loaded.", 500);
  }

  return result.data;
}

export async function updateProjectSetupDetails(
  token: string,
  projectId: string,
  section: ProjectSetupDetailsSection,
  payload: ProjectSetupDetailsPayload,
): Promise<ProjectSetup> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/${section}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup data could not be loaded.", 500);
  }

  return result.data;
}

export async function updateProjectSetupBudget(
  token: string,
  projectId: string,
  payload: ProjectSetupBudgetPayload,
): Promise<ProjectSetup> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/setup/budget`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  const result = projectSetupSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project setup data could not be loaded.", 500);
  }

  return result.data;
}

export async function updatePhaseBudget(token: string, projectId: string, phaseId: string, payload: PhaseBudgetMutationPayload): Promise<PhaseResponse> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/budget`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parsePhase(data);
}

export async function createProject(token: string, payload: ProjectMutationPayload): Promise<ProjectSummary> {
  const data = await apiRequest<unknown>(
    "/projects",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseProject(data);
}

export async function updateProject(token: string, projectId: string, payload: ProjectMutationPayload): Promise<ProjectSummary> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseProject(data);
}

export async function archiveProject(token: string, projectId: string): Promise<ProjectSummary> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/archive`,
    {
      method: "PATCH",
    },
    token,
  );
  return parseProject(data);
}

export async function listProjectMembers(token: string, projectId: string): Promise<ProjectMember[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/members`, {}, token);
  const result = projectMembersSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project member data could not be loaded.", 500);
  }

  return result.data;
}

export async function addProjectMember(token: string, projectId: string, userId: string, role = "Team Member"): Promise<ProjectMember> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/members`,
    {
      method: "POST",
      body: JSON.stringify({ user_id: userId, role }),
    },
    token,
  );
  const result = projectMemberSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project member data could not be loaded.", 500);
  }

  return result.data;
}

export async function removeProjectMember(token: string, projectId: string, userId: string): Promise<void> {
  await apiRequest<void>(
    `/projects/${projectId}/members/${userId}`,
    {
      method: "DELETE",
    },
    token,
  );
}

export async function listPhaseMembers(token: string, projectId: string, phaseId: string): Promise<PhaseMember[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/phases/${phaseId}/members`, {}, token);
  const result = phaseMembersSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Phase member data could not be loaded.", 500);
  }

  return result.data;
}

export async function addPhaseMember(token: string, projectId: string, phaseId: string, userId: string): Promise<PhaseMember> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/members`,
    {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    },
    token,
  );
  const result = phaseMemberSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Phase member data could not be loaded.", 500);
  }

  return result.data;
}

export async function removePhaseMember(token: string, projectId: string, phaseId: string, userId: string): Promise<void> {
  await apiRequest<void>(
    `/projects/${projectId}/phases/${phaseId}/members/${userId}`,
    {
      method: "DELETE",
    },
    token,
  );
}

export async function createPhase(token: string, projectId: string, payload: PhaseMutationPayload): Promise<PhaseResponse> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parsePhase(data);
}

export async function updatePhase(token: string, projectId: string, phaseId: string, payload: PhaseMutationPayload): Promise<PhaseResponse> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parsePhase(data);
}

export async function reorderPhases(token: string, projectId: string, phaseIds: string[]): Promise<PhaseResponse[]> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/reorder`,
    {
      method: "PATCH",
      body: JSON.stringify({ phase_ids: phaseIds }),
    },
    token,
  );
  const result = phaseResponsesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Phase order data could not be loaded.", 500);
  }

  return result.data;
}

export async function archivePhase(token: string, projectId: string, phaseId: string): Promise<PhaseResponse> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/archive`,
    {
      method: "PATCH",
    },
    token,
  );
  return parsePhase(data);
}

export async function completePhase(token: string, projectId: string, phaseId: string): Promise<PhaseResponse> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/complete`,
    {
      method: "PATCH",
    },
    token,
  );
  return parsePhase(data);
}

export async function setCurrentPhase(token: string, projectId: string, phaseId: string | null): Promise<ProjectSummary> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/current-phase`,
    {
      method: "PATCH",
      body: JSON.stringify({ phase_id: phaseId }),
    },
    token,
  );
  return parseProject(data);
}

export async function listTasks(token: string, projectId: string, phaseId: string): Promise<Task[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/phases/${phaseId}/tasks`, {}, token);
  const result = tasksSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Task data could not be loaded.", 500);
  }

  return result.data;
}

export async function createTask(token: string, projectId: string, phaseId: string, payload: TaskMutationPayload): Promise<Task> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/tasks`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseTask(data);
}

export async function updateTask(token: string, projectId: string, phaseId: string, taskId: string, payload: TaskMutationPayload): Promise<Task> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseTask(data);
}

export async function updateTaskStatus(token: string, projectId: string, phaseId: string, taskId: string, status: Task["status"]): Promise<Task> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
    token,
  );
  return parseTask(data);
}

export async function listTaskSupporters(token: string, projectId: string, phaseId: string, taskId: string): Promise<TaskSupporter[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/supporters`, {}, token);
  const result = taskSupportersSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Task supporter data could not be loaded.", 500);
  }

  return result.data;
}

export async function addTaskSupporter(token: string, projectId: string, phaseId: string, taskId: string, userId: string): Promise<TaskSupporter> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/supporters`,
    {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    },
    token,
  );
  const result = taskSupporterSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Task supporter data could not be loaded.", 500);
  }

  return result.data;
}

export async function removeTaskSupporter(token: string, projectId: string, phaseId: string, taskId: string, userId: string): Promise<void> {
  await apiRequest<void>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/supporters/${userId}`,
    {
      method: "DELETE",
    },
    token,
  );
}

export async function getChecklist(token: string, projectId: string, phaseId: string, taskId: string): Promise<Checklist> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/checklist`, {}, token);
  const result = checklistSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Checklist data could not be loaded.", 500);
  }

  return result.data;
}

export async function createChecklistItem(
  token: string,
  projectId: string,
  phaseId: string,
  taskId: string,
  payload: { description: string; is_completed: boolean; display_order: number },
): Promise<ChecklistItem> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/checklist`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseChecklistItem(data);
}

export async function updateChecklistItem(
  token: string,
  projectId: string,
  phaseId: string,
  taskId: string,
  itemId: string,
  payload: { description?: string; is_completed?: boolean; display_order?: number },
): Promise<ChecklistItem> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/checklist/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
  return parseChecklistItem(data);
}

export async function setChecklistItemCompletion(
  token: string,
  projectId: string,
  phaseId: string,
  taskId: string,
  itemId: string,
  isCompleted: boolean,
): Promise<ChecklistItem> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/checklist/${itemId}/completion`,
    {
      method: "PATCH",
      body: JSON.stringify({ is_completed: isCompleted }),
    },
    token,
  );
  return parseChecklistItem(data);
}

export async function removeChecklistItem(token: string, projectId: string, phaseId: string, taskId: string, itemId: string): Promise<void> {
  await apiRequest<void>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/checklist/${itemId}`,
    {
      method: "DELETE",
    },
    token,
  );
}

export async function listTaskComments(token: string, projectId: string, phaseId: string, taskId: string): Promise<TaskComment[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/comments`, {}, token);
  const result = taskCommentsSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Comment data could not be loaded.", 500);
  }

  return result.data;
}

export async function listUnreadCommentNotifications(token: string): Promise<CommentNotification[]> {
  const result = commentNotificationsSchema.safeParse(await apiRequest<unknown>("/projects/comment-notifications/unread", {}, token));
  if (!result.success) throw new ApiError("Unread comments could not be loaded.", 500);
  return result.data;
}

export async function markTaskCommentsRead(token: string, projectId: string, taskId: string): Promise<void> {
  await apiRequest<void>(`/projects/comment-notifications/${projectId}/tasks/${taskId}/read`, { method: "POST" }, token);
}

export async function createTaskComment(
  token: string,
  projectId: string,
  phaseId: string,
  taskId: string,
  comment: string,
): Promise<TaskComment> {
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ comment }),
    },
    token,
  );
  const result = taskCommentSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Comment data could not be loaded.", 500);
  }

  return result.data;
}

export async function listTaskFiles(token: string, projectId: string, phaseId: string, taskId: string): Promise<TaskFile[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/files`, {}, token);
  const result = taskFilesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("File data could not be loaded.", 500);
  }

  return result.data;
}

export async function uploadTaskFile(
  token: string,
  projectId: string,
  phaseId: string,
  taskId: string,
  file: File,
  fileCategory: TaskFile["file_category"] = "work_submission",
  setupDocumentType?: TaskFile["setup_document_type"],
): Promise<TaskFile> {
  const body = new FormData();
  body.append("file_category", fileCategory);
  if (setupDocumentType) body.append("setup_document_type", setupDocumentType);
  body.append("file", file);
  const data = await apiRequest<unknown>(
    `/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/files`,
    {
      method: "POST",
      body,
    },
    token,
  );
  const result = taskFileSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("File data could not be loaded.", 500);
  }

  return result.data;
}

export async function downloadTaskFile(token: string, projectId: string, phaseId: string, taskId: string, fileId: string): Promise<DownloadedTaskFile> {
  const response = await fetch(`${apiBaseUrl()}/projects/${projectId}/phases/${phaseId}/tasks/${taskId}/files/${fileId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new ApiError(await safeFileErrorMessage(response), response.status);
  }

  return {
    blob: await response.blob(),
    fileName: parseDownloadFileName(response.headers.get("content-disposition")) ?? "attachment",
  };
}

function parseProject(data: unknown) {
  const result = projectSummarySchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project data could not be loaded.", 500);
  }

  return result.data;
}

function parsePhase(data: unknown) {
  const result = phaseResponseSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Phase data could not be loaded.", 500);
  }

  return result.data;
}

function parseTask(data: unknown) {
  const result = taskSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Task data could not be loaded.", 500);
  }

  return result.data;
}

function parseChecklistItem(data: unknown) {
  const result = checklistItemSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Checklist item data could not be loaded.", 500);
  }

  return result.data;
}

function parseWorkspaceFolder(data: unknown) {
  const result = workspaceFolderSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Workspace folder data could not be loaded.", 500);
  }

  return result.data;
}

function parseWorkspaceNativeResource(data: unknown) {
  const result = workspaceNativeResourceSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Workspace resource data could not be loaded.", 500);
  }

  return result.data;
}

function apiBaseUrl() {
  return env.apiBaseUrl;
}

async function safeFileErrorMessage(response: Response) {
  if (response.status === 401) {
    return "Invalid or expired credentials.";
  }
  if (response.status === 403) {
    return "You do not have access to this file.";
  }
  if (response.status === 404) {
    return "The requested file could not be found.";
  }
  if (response.status === 413) {
    return "The selected file is too large.";
  }
  if (response.status >= 500) {
    return "File storage is unavailable. Please try again later.";
  }

  return "The file request could not be completed.";
}

function parseDownloadFileName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return null;
  }

  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const fallbackMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return fallbackMatch?.[1] ?? null;
}
