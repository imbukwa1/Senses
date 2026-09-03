import { ApiError, apiRequest } from "@/features/auth/api";

import { projectMembersSchema, projectSummariesSchema, projectSummarySchema } from "./schemas";
import type { ProjectMember, ProjectMutationPayload, ProjectSummary } from "./types";

export async function listProjects(token: string): Promise<ProjectSummary[]> {
  const data = await apiRequest<unknown>("/projects", {}, token);
  const result = projectSummariesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project data could not be loaded.", 500);
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

function parseProject(data: unknown) {
  const result = projectSummarySchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project data could not be loaded.", 500);
  }

  return result.data;
}
