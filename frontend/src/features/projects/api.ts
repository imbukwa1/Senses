import { ApiError, apiRequest } from "@/features/auth/api";

import { phaseResponseSchema, phaseResponsesSchema, projectDashboardSchema, projectMembersSchema, projectSummariesSchema, projectSummarySchema } from "./schemas";
import type { PhaseMutationPayload, PhaseResponse, ProjectDashboard, ProjectMember, ProjectMutationPayload, ProjectSummary } from "./types";

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
