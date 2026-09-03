import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";

import { listProjects } from "./api";

export const projectsQueryKey = ["projects", "list"] as const;

export function useProjectsQuery() {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectsQueryKey,
    queryFn: () => listProjects(token ?? ""),
    enabled: status === "authenticated" && Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      logout();
    }
  }, [logout, query.error]);

  return query;
}
