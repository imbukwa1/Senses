import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";

import {
  archivePhase,
  completePhase,
  createPhase,
  createProject,
  getProject,
  getProjectDashboard,
  listProjectMembers,
  listProjects,
  removeProjectMember,
  reorderPhases,
  setCurrentPhase,
  updatePhase,
  updateProject,
} from "./api";
import type { PhaseMutationPayload, ProjectMutationPayload } from "./types";

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
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
    },
  });
}

export function useCreatePhaseMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: PhaseMutationPayload) => createPhase(requireToken(token), projectId, payload),
    onSuccess: () => invalidateProjectDashboardQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useUpdatePhaseMutation(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: PhaseMutationPayload) => updatePhase(requireToken(token), projectId, phaseId, payload),
    onSuccess: () => invalidateProjectDashboardQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useReorderPhasesMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (phaseIds: string[]) => reorderPhases(requireToken(token), projectId, phaseIds),
    onSuccess: () => invalidateProjectDashboardQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useArchivePhaseMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (phaseId: string) => archivePhase(requireToken(token), projectId, phaseId),
    onSuccess: () => invalidateProjectDashboardQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useCompletePhaseMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (phaseId: string) => completePhase(requireToken(token), projectId, phaseId),
    onSuccess: () => invalidateProjectDashboardQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useSetCurrentPhaseMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (phaseId: string | null) => setCurrentPhase(requireToken(token), projectId, phaseId),
    onSuccess: () => {
      invalidateProjectDashboardQueries(queryClient, projectId);
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
    onError: authFailureHandler(logout),
  });
}

function invalidateProjectDashboardQueries(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
  void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) });
}

function authFailureHandler(logout: () => void) {
  return (error: Error) => {
    if (error instanceof ApiError && error.status === 401) {
      logout();
    }
  };
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
