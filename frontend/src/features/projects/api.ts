import { ApiError, apiRequest } from "@/features/auth/api";

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
  projectMemberSchema,
  projectMembersSchema,
  projectSummariesSchema,
  projectSummarySchema,
  taskSchema,
  taskCommentSchema,
  taskCommentsSchema,
  taskFileSchema,
  taskFilesSchema,
  taskSupporterSchema,
  taskSupportersSchema,
  tasksSchema,
} from "./schemas";
import type {
  PhaseMutationPayload,
  AttentionItem,
  PhaseMember,
  MyWorkItem,
  ProjectBudget,
  ProjectBudgetMutationPayload,
  PhaseResponse,
  ProjectDashboard,
  ProjectMember,
  ProjectMutationPayload,
  ProjectSummary,
  Task,
  Checklist,
  ChecklistItem,
  TaskComment,
  DownloadedTaskFile,
  TaskFile,
  TaskMutationPayload,
  TaskSupporter,
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

export async function getProjectBudget(token: string, projectId: string): Promise<ProjectBudget> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/budget`, {}, token);
  const result = projectBudgetSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project budget data could not be loaded.", 500);
  }

  return result.data;
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

export async function uploadTaskFile(token: string, projectId: string, phaseId: string, taskId: string, file: File): Promise<TaskFile> {
  const body = new FormData();
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

function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "") || "http://localhost:8000";
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
