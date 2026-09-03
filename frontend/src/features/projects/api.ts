import { ApiError, apiRequest } from "@/features/auth/api";

import {
  phaseResponseSchema,
  phaseResponsesSchema,
  checklistItemSchema,
  checklistSchema,
  projectDashboardSchema,
  projectMembersSchema,
  projectSummariesSchema,
  projectSummarySchema,
  taskSchema,
  taskCommentSchema,
  taskCommentsSchema,
  taskSupporterSchema,
  taskSupportersSchema,
  tasksSchema,
} from "./schemas";
import type {
  PhaseMutationPayload,
  PhaseResponse,
  ProjectDashboard,
  ProjectMember,
  ProjectMutationPayload,
  ProjectSummary,
  Task,
  Checklist,
  ChecklistItem,
  TaskComment,
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

export async function listProjectMembers(token: string, projectId: string): Promise<ProjectMember[]> {
  const data = await apiRequest<unknown>(`/projects/${projectId}/members`, {}, token);
  const result = projectMembersSchema.safeParse(data);

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
