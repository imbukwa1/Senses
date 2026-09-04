import { ApiError, apiRequest } from "@/features/auth/api";

import { userLookupResultsSchema } from "./schemas";
import type { UserLookupResult } from "./types";

export async function searchUsers(token: string, search: string): Promise<UserLookupResult[]> {
  const params = new URLSearchParams({ search });
  const data = await apiRequest<unknown>(`/users?${params.toString()}`, {}, token);
  const result = userLookupResultsSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("User lookup data could not be loaded.", 500);
  }

  return result.data;
}
