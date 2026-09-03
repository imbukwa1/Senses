import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";

import {
  archiveProject,
  archivePhase,
  addProjectMember,
  addTaskSupporter,
  completePhase,
  createChecklistItem,
  createPhase,
  createProject,
  createTaskComment,
  createTask,
  downloadTaskFile,
  getChecklist,
  getProject,
  getProjectDashboard,
  listProjectMembers,
  listProjects,
  listTaskComments,
  listTaskFiles,
  listTasks,
  listTaskSupporters,
  removeProjectMember,
  removeChecklistItem,
  removeTaskSupporter,
  reorderPhases,
  setChecklistItemCompletion,
  setCurrentPhase,
  updateChecklistItem,
  updatePhase,
  updateProject,
  updateTask,
  uploadTaskFile,
} from "./api";
import type { PhaseMutationPayload, ProjectMutationPayload, TaskMutationPayload } from "./types";

export const projectsQueryKey = ["projects", "list"] as const;
export const projectQueryKey = (projectId: string) => ["projects", projectId] as const;
export const projectDashboardQueryKey = (projectId: string) => ["projects", projectId, "dashboard"] as const;
export const projectMembersQueryKey = (projectId: string) => ["projects", projectId, "members"] as const;
export const tasksQueryKey = (projectId: string, phaseId: string) => ["projects", projectId, "phases", phaseId, "tasks"] as const;
export const taskSupportersQueryKey = (projectId: string, phaseId: string, taskId: string) =>
  ["projects", projectId, "phases", phaseId, "tasks", taskId, "supporters"] as const;
export const checklistQueryKey = (projectId: string, phaseId: string, taskId: string) =>
  ["projects", projectId, "phases", phaseId, "tasks", taskId, "checklist"] as const;
export const taskCommentsQueryKey = (projectId: string, phaseId: string, taskId: string) =>
  ["projects", projectId, "phases", phaseId, "tasks", taskId, "comments"] as const;
export const taskFilesQueryKey = (projectId: string, phaseId: string, taskId: string) =>
  ["projects", projectId, "phases", phaseId, "tasks", taskId, "files"] as const;

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

export function useArchiveProjectMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: () => archiveProject(requireToken(token), projectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
    },
    onError: authFailureHandler(logout),
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

export function useTasksQuery(projectId: string, phaseId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: tasksQueryKey(projectId, phaseId),
    queryFn: () => listTasks(requireToken(token), projectId, phaseId),
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

export function useTaskSupportersQuery(projectId: string, phaseId: string, taskId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: taskSupportersQueryKey(projectId, phaseId, taskId),
    queryFn: () => listTaskSupporters(requireToken(token), projectId, phaseId, taskId),
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

export function useCreateTaskMutation(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: async ({ payload, supporterIds }: { payload: TaskMutationPayload; supporterIds: string[] }) => {
      const authToken = requireToken(token);
      const task = await createTask(authToken, projectId, phaseId, payload);
      await Promise.all(uniqueIds(supporterIds).map((userId) => addTaskSupporter(authToken, projectId, phaseId, task.id, userId)));
      return task;
    },
    onSuccess: () => invalidateTaskQueries(queryClient, projectId, phaseId),
    onError: authFailureHandler(logout),
  });
}

export function useUpdateTaskMutation(projectId: string, phaseId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: async ({
      currentSupporterIds,
      payload,
      supporterIds,
    }: {
      payload: TaskMutationPayload;
      supporterIds: string[];
      currentSupporterIds: string[];
    }) => {
      const authToken = requireToken(token);
      const task = await updateTask(authToken, projectId, phaseId, taskId, payload);
      const desiredIds = uniqueIds(supporterIds);
      const currentIds = uniqueIds(currentSupporterIds);
      const toAdd = desiredIds.filter((userId) => !currentIds.includes(userId));
      const toRemove = currentIds.filter((userId) => !desiredIds.includes(userId));

      await Promise.all(toAdd.map((userId) => addTaskSupporter(authToken, projectId, phaseId, taskId, userId)));
      await Promise.all(toRemove.map((userId) => removeTaskSupporter(authToken, projectId, phaseId, taskId, userId)));
      return task;
    },
    onSuccess: () => {
      invalidateTaskQueries(queryClient, projectId, phaseId);
      void queryClient.invalidateQueries({ queryKey: taskSupportersQueryKey(projectId, phaseId, taskId) });
    },
    onError: authFailureHandler(logout),
  });
}

export function useChecklistQuery(projectId: string, phaseId: string, taskId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: checklistQueryKey(projectId, phaseId, taskId),
    queryFn: () => getChecklist(requireToken(token), projectId, phaseId, taskId),
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

export function useCreateChecklistItemMutation(projectId: string, phaseId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: { description: string; is_completed: boolean; display_order: number }) =>
      createChecklistItem(requireToken(token), projectId, phaseId, taskId, payload),
    onSuccess: () => invalidateChecklistQueries(queryClient, projectId, phaseId, taskId),
    onError: authFailureHandler(logout),
  });
}

export function useUpdateChecklistItemMutation(projectId: string, phaseId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ itemId, description }: { itemId: string; description: string }) =>
      updateChecklistItem(requireToken(token), projectId, phaseId, taskId, itemId, { description }),
    onSuccess: () => invalidateChecklistQueries(queryClient, projectId, phaseId, taskId),
    onError: authFailureHandler(logout),
  });
}

export function useSetChecklistItemCompletionMutation(projectId: string, phaseId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ itemId, isCompleted }: { itemId: string; isCompleted: boolean }) =>
      setChecklistItemCompletion(requireToken(token), projectId, phaseId, taskId, itemId, isCompleted),
    onSuccess: () => invalidateChecklistQueries(queryClient, projectId, phaseId, taskId),
    onError: authFailureHandler(logout),
  });
}

export function useRemoveChecklistItemMutation(projectId: string, phaseId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (itemId: string) => removeChecklistItem(requireToken(token), projectId, phaseId, taskId, itemId),
    onSuccess: () => invalidateChecklistQueries(queryClient, projectId, phaseId, taskId),
    onError: authFailureHandler(logout),
  });
}

export function useTaskCommentsQuery(projectId: string, phaseId: string, taskId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: taskCommentsQueryKey(projectId, phaseId, taskId),
    queryFn: () => listTaskComments(requireToken(token), projectId, phaseId, taskId),
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

export function useCreateTaskCommentMutation(projectId: string, phaseId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (comment: string) => createTaskComment(requireToken(token), projectId, phaseId, taskId, comment),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskCommentsQueryKey(projectId, phaseId, taskId) });
    },
    onError: authFailureHandler(logout),
  });
}

export function useTaskFilesQuery(projectId: string, phaseId: string, taskId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: taskFilesQueryKey(projectId, phaseId, taskId),
    queryFn: () => listTaskFiles(requireToken(token), projectId, phaseId, taskId),
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

export function useUploadTaskFileMutation(projectId: string, phaseId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (file: File) => uploadTaskFile(requireToken(token), projectId, phaseId, taskId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskFilesQueryKey(projectId, phaseId, taskId) });
    },
    onError: authFailureHandler(logout),
  });
}

export function useDownloadTaskFileMutation(projectId: string, phaseId: string, taskId: string) {
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (fileId: string) => downloadTaskFile(requireToken(token), projectId, phaseId, taskId, fileId),
    onError: authFailureHandler(logout),
  });
}

function invalidateProjectDashboardQueries(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
  void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) });
}

function invalidateTaskQueries(queryClient: ReturnType<typeof useQueryClient>, projectId: string, phaseId: string) {
  void queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId, phaseId) });
  void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
}

function invalidateChecklistQueries(queryClient: ReturnType<typeof useQueryClient>, projectId: string, phaseId: string, taskId: string) {
  void queryClient.invalidateQueries({ queryKey: checklistQueryKey(projectId, phaseId, taskId) });
  void queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId, phaseId) });
  void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
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

export function useAddProjectMemberMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (userId: string) => addProjectMember(requireToken(token), projectId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectMembersQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
    },
    onError: authFailureHandler(logout),
  });
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

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}
