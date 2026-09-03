import { ApiError, apiRequest } from "@/features/auth/api";

import { projectSummariesSchema } from "./schemas";
import type { ProjectSummary } from "./types";

export async function listProjects(token: string): Promise<ProjectSummary[]> {
  const data = await apiRequest<unknown>("/projects", {}, token);
  const result = projectSummariesSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Project data could not be loaded.", 500);
  }

  return result.data;
}
