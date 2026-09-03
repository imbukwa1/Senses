import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";

import { searchRecords } from "./api";

export const searchQueryKey = (query: string) => ["search", normalizeSearchQuery(query)] as const;

export function useSearchQuery(query: string) {
  const { logout, status, token } = useAuth();
  const normalizedQuery = normalizeSearchQuery(query);
  const isEnabled = status === "authenticated" && Boolean(token) && normalizedQuery.length > 0;

  const searchQuery = useQuery({
    queryKey: searchQueryKey(normalizedQuery),
    queryFn: () => searchRecords(requireToken(token), normalizedQuery),
    enabled: isEnabled,
    retry: false,
  });

  useEffect(() => {
    if (searchQuery.error instanceof ApiError && searchQuery.error.status === 401) {
      logout();
    }
  }, [logout, searchQuery.error]);

  return {
    ...searchQuery,
    normalizedQuery,
  };
}

export function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

function requireToken(token: string | null) {
  if (!token) {
    throw new ApiError("Authentication is required.", 401);
  }

  return token;
}
