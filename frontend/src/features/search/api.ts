import { ApiError, apiRequest } from "@/features/auth/api";

import { searchResultsSchema } from "./schemas";
import type { SearchResult } from "./types";

export async function searchRecords(token: string, query: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const data = await apiRequest<unknown>(`/search?${params.toString()}`, {}, token);
  const result = searchResultsSchema.safeParse(data);

  if (!result.success) {
    throw new ApiError("Search results could not be loaded.", 500);
  }

  return result.data;
}
