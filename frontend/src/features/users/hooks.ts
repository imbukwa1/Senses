import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";

import { searchUsers } from "./api";

export const usersSearchQueryKey = (search: string) => ["users", "search", normalizeUserSearch(search)] as const;

export function useUsersSearchQuery(search: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const normalizedSearch = normalizeUserSearch(search);
  const query = useQuery({
    queryKey: usersSearchQueryKey(normalizedSearch),
    queryFn: () => searchUsers(requireToken(token), normalizedSearch),
    enabled: enabled && status === "authenticated" && Boolean(token) && normalizedSearch.length > 0,
    retry: false,
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      logout();
    }
  }, [logout, query.error]);

  return {
    ...query,
    normalizedSearch,
  };
}

export function normalizeUserSearch(search: string) {
  return search.trim().replace(/\s+/g, " ");
}

function requireToken(token: string | null) {
  if (!token) {
    throw new ApiError("Authentication is required.", 401);
  }

  return token;
}
