import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";

import { createProject, getProject, getProjectDashboard, listProjectMembers, listProjects, removeProjectMember, updateProject } from "./api";
import type { ProjectMutationPayload } from "./types";

export const projectsQueryKey = ["projects", "list"] as const;
export const projectQueryKey = (projectId: string) => ["projects", projectId] as const;
export const projectDashboardQueryKey = (projectId: string) => ["projects", projectId, "dashboard"] as const;
export const projectMembersQueryKey = (projectId: string) => ["projects", projectId, "members"] as const;

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

export function useCreateProjectMutation() {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: ProjectMutationPayload) => createProject(requireToken(token), payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
    },
  });
}

export function useProjectQuery(projectId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectQueryKey(projectId),
    queryFn: () => getProject(requireToken(token), projectId),
    enabled: enabled && status === "authenticated" && Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      logout();
    }
  }, [logout, query.error]);

  return query;
}

export function useProjectDashboardQuery(projectId: string) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectDashboardQueryKey(projectId),
    queryFn: () => getProjectDashboard(requireToken(token), projectId),
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

export function useUpdateProjectMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: ProjectMutationPayload) => updateProject(requireToken(token), projectId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
    },
  });
}

export function useProjectMembersQuery(projectId: string, enabled: boolean) {
  const { logout, token } = useAuth();
  const query = useQuery({
    queryKey: projectMembersQueryKey(projectId),
    queryFn: () => listProjectMembers(requireToken(token), projectId),
    enabled: enabled && Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      logout();
    }
  }, [logout, query.error]);

  return query;
}

export function useRemoveProjectMemberMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (userId: string) => removeProjectMember(requireToken(token), projectId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectMembersQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
    },
  });
}

function requireToken(token: string | null) {
  if (!token) {
    throw new ApiError("Authentication is required.", 401);
  }

  return token;
}
