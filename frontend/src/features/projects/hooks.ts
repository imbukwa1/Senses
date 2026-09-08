import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";

import {
  archiveProject,
  archivePhase,
  addPhaseMember,
  addProjectMember,
  addTaskSupporter,
  completePhase,
  createProjectSetupDeliverable,
  createProjectSetupMilestone,
  createProjectSetupResource,
  createWorkspaceNativeResource,
  createWorkspaceFolder,
  createChecklistItem,
  createPhase,
  createProject,
  createTaskComment,
  createTask,
  deleteWorkspaceFolder,
  deleteWorkspaceNativeResource,
  downloadProjectFile,
  downloadTaskFile,
  getChecklist,
  getProject,
  getProjectBudget,
  getProjectDashboard,
  getProjectSetup,
  getProjectSetupBudget,
  getWorkspaceNativeResource,
  getWorkspaceContents,
  listAttention,
  listMyWork,
  listPhaseMembers,
  listProjectSetupDeliverables,
  listProjectSetupMilestones,
  listProjectSetupResources,
  listProjectFiles,
  listProjectMembers,
  listProjects,
  listTaskComments,
  listTaskFiles,
  listTasks,
  listTaskSupporters,
  removePhaseMember,
  removeProjectMember,
  removeChecklistItem,
  removeTaskSupporter,
  reorderPhases,
  setChecklistItemCompletion,
  setCurrentPhase,
  updateChecklistItem,
  updateWorkspaceNativeResourceContent,
  updateWorkspaceNativeResourceTaskLink,
  updateWorkspaceFolder,
  updatePhase,
  updatePhaseBudget,
  updateProject,
  updateProjectBudget,
  updateProjectSetupBudget,
  updateProjectSetupDetails,
  updateProjectSetupSection,
  updateTask,
  updateTaskStatus,
  renameWorkspaceNativeResource,
  moveWorkspaceNativeResource,
  moveWorkspaceFile,
  uploadTaskFile,
} from "./api";
import type {
  PhaseBudgetMutationPayload,
  PhaseMutationPayload,
  ProjectBudgetMutationPayload,
  ProjectSetupBudgetPayload,
  ProjectSetupDeliverablePayload,
  ProjectSetupMilestonePayload,
  ProjectSetupResourcePayload,
  ProjectMutationPayload,
  ProjectSetupDetailsPayload,
  ProjectSetupDetailsSection,
  ProjectSetupSectionStatusPayload,
  Task,
  TaskFile,
  TaskMutationPayload,
  WorkspaceNativeResourceContentPayload,
  WorkspaceNativeResourceMovePayload,
  WorkspaceNativeResourceMutationPayload,
  WorkspaceNativeResourceRenamePayload,
  WorkspaceNativeResourceTaskLinkPayload,
  WorkspaceResourceKind,
  WorkspaceFolderMutationPayload,
} from "./types";

export const projectsQueryKey = ["projects", "list"] as const;
export const attentionQueryKey = ["attention", "list"] as const;
export const myWorkQueryKey = ["my-work", "list"] as const;
export const projectQueryKey = (projectId: string) => ["projects", projectId] as const;
export const projectBudgetQueryKey = (projectId: string) => ["projects", projectId, "budget"] as const;
export const projectFilesQueryKey = (projectId: string) => ["projects", projectId, "files"] as const;
export const projectDashboardQueryKey = (projectId: string) => ["projects", projectId, "dashboard"] as const;
export const projectSetupQueryKey = (projectId: string) => ["projects", projectId, "setup"] as const;
export const projectSetupBudgetQueryKey = (projectId: string) => ["projects", projectId, "setup", "budget"] as const;
export const projectSetupMilestonesQueryKey = (projectId: string) => ["projects", projectId, "setup", "milestones"] as const;
export const projectSetupDeliverablesQueryKey = (projectId: string) => ["projects", projectId, "setup", "deliverables"] as const;
export const projectSetupResourcesQueryKey = (projectId: string) => ["projects", projectId, "setup", "resources"] as const;
export const workspaceContentsQueryKey = (projectId: string, folderId: string | null) => ["projects", projectId, "workspace", folderId ?? "root"] as const;
export const workspaceNativeResourceQueryKey = (projectId: string, kind: WorkspaceResourceKind, resourceId: string) =>
  ["projects", projectId, "workspace", kind, resourceId] as const;
export const projectMembersQueryKey = (projectId: string) => ["projects", projectId, "members"] as const;
export const phaseMembersQueryKey = (projectId: string, phaseId: string) => ["projects", projectId, "phases", phaseId, "members"] as const;
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

export function useAttentionQuery() {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: attentionQueryKey,
    queryFn: () => listAttention(requireToken(token)),
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

export function useMyWorkQuery() {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: myWorkQueryKey,
    queryFn: () => listMyWork(requireToken(token)),
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

export function useProjectSetupQuery(projectId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectSetupQueryKey(projectId),
    queryFn: () => getProjectSetup(requireToken(token), projectId),
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

export function useProjectSetupBudgetQuery(projectId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectSetupBudgetQueryKey(projectId),
    queryFn: () => getProjectSetupBudget(requireToken(token), projectId),
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

export function useProjectSetupMilestonesQuery(projectId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectSetupMilestonesQueryKey(projectId),
    queryFn: () => listProjectSetupMilestones(requireToken(token), projectId),
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

export function useProjectSetupDeliverablesQuery(projectId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectSetupDeliverablesQueryKey(projectId),
    queryFn: () => listProjectSetupDeliverables(requireToken(token), projectId),
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

export function useProjectSetupResourcesQuery(projectId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectSetupResourcesQueryKey(projectId),
    queryFn: () => listProjectSetupResources(requireToken(token), projectId),
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

export function useProjectBudgetQuery(projectId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectBudgetQueryKey(projectId),
    queryFn: () => getProjectBudget(requireToken(token), projectId),
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

export function useProjectFilesQuery(projectId: string, enabled = true) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: projectFilesQueryKey(projectId),
    queryFn: () => listProjectFiles(requireToken(token), projectId),
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

export function useDownloadProjectFileMutation(projectId: string) {
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (fileId: string) => downloadProjectFile(requireToken(token), projectId, fileId),
    onError: authFailureHandler(logout),
  });
}

export function useWorkspaceContentsQuery(projectId: string, folderId: string | null) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: workspaceContentsQueryKey(projectId, folderId),
    queryFn: () => getWorkspaceContents(requireToken(token), projectId, folderId),
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

export function useWorkspaceFolderTreeQuery(projectId: string) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: ["projects", projectId, "workspace", "folder-tree"],
    queryFn: async () => {
      const authToken = requireToken(token);
      const folders: Awaited<ReturnType<typeof getWorkspaceContents>>["folders"] = [];
      const visit = async (folderId: string | null) => {
        const contents = await getWorkspaceContents(authToken, projectId, folderId);
        folders.push(...contents.folders);
        await Promise.all(contents.folders.map((folder) => visit(folder.id)));
      };
      await visit(null);
      return folders;
    },
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

export function useCreateWorkspaceFolderMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: WorkspaceFolderMutationPayload) => createWorkspaceFolder(requireToken(token), projectId, payload),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useUpdateWorkspaceFolderMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ folderId, payload }: { folderId: string; payload: WorkspaceFolderMutationPayload }) =>
      updateWorkspaceFolder(requireToken(token), projectId, folderId, payload),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useDeleteWorkspaceFolderMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (folderId: string) => deleteWorkspaceFolder(requireToken(token), projectId, folderId),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useMoveWorkspaceFileMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ fileId, folderId }: { fileId: string; folderId: string | null }) =>
      moveWorkspaceFile(requireToken(token), projectId, fileId, { folder_id: folderId }),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useWorkspaceNativeResourceQuery(projectId: string, kind: WorkspaceResourceKind, resourceId: string | null) {
  const { logout, status, token } = useAuth();
  const query = useQuery({
    queryKey: workspaceNativeResourceQueryKey(projectId, kind, resourceId ?? "missing"),
    queryFn: () => getWorkspaceNativeResource(requireToken(token), projectId, kind, resourceId ?? ""),
    enabled: status === "authenticated" && Boolean(token) && Boolean(resourceId),
    retry: false,
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      logout();
    }
  }, [logout, query.error]);

  return query;
}

export function useCreateWorkspaceNativeResourceMutation(projectId: string, kind: WorkspaceResourceKind) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: WorkspaceNativeResourceMutationPayload) => createWorkspaceNativeResource(requireToken(token), projectId, kind, payload),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useUpdateWorkspaceNativeResourceContentMutation(projectId: string, kind: WorkspaceResourceKind, resourceId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: WorkspaceNativeResourceContentPayload) =>
      updateWorkspaceNativeResourceContent(requireToken(token), projectId, kind, resourceId, payload),
    onSuccess: (resource) => {
      queryClient.setQueryData(workspaceNativeResourceQueryKey(projectId, kind, resourceId), resource);
      invalidateWorkspaceQueries(queryClient, projectId);
    },
    onError: authFailureHandler(logout),
  });
}

export function useRenameWorkspaceNativeResourceMutation(projectId: string, kind: WorkspaceResourceKind) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ resourceId, payload }: { resourceId: string; payload: WorkspaceNativeResourceRenamePayload }) =>
      renameWorkspaceNativeResource(requireToken(token), projectId, kind, resourceId, payload),
    onSuccess: (resource) => {
      queryClient.setQueryData(workspaceNativeResourceQueryKey(projectId, kind, resource.id), resource);
      invalidateWorkspaceQueries(queryClient, projectId);
    },
    onError: authFailureHandler(logout),
  });
}

export function useMoveWorkspaceNativeResourceMutation(projectId: string, kind: WorkspaceResourceKind) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ resourceId, payload }: { resourceId: string; payload: WorkspaceNativeResourceMovePayload }) =>
      moveWorkspaceNativeResource(requireToken(token), projectId, kind, resourceId, payload),
    onSuccess: (resource) => {
      queryClient.setQueryData(workspaceNativeResourceQueryKey(projectId, kind, resource.id), resource);
      invalidateWorkspaceQueries(queryClient, projectId);
    },
    onError: authFailureHandler(logout),
  });
}

export function useUpdateWorkspaceNativeResourceTaskLinkMutation(projectId: string, kind: WorkspaceResourceKind) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ resourceId, payload }: { resourceId: string; payload: WorkspaceNativeResourceTaskLinkPayload }) =>
      updateWorkspaceNativeResourceTaskLink(requireToken(token), projectId, kind, resourceId, payload),
    onSuccess: (resource) => {
      queryClient.setQueryData(workspaceNativeResourceQueryKey(projectId, kind, resource.id), resource);
      invalidateWorkspaceQueries(queryClient, projectId);
    },
    onError: authFailureHandler(logout),
  });
}

export function useDeleteWorkspaceNativeResourceMutation(projectId: string, kind: WorkspaceResourceKind) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (resourceId: string) => deleteWorkspaceNativeResource(requireToken(token), projectId, kind, resourceId),
    onSuccess: () => invalidateWorkspaceQueries(queryClient, projectId),
    onError: authFailureHandler(logout),
  });
}

export function useUpdateProjectBudgetMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: ProjectBudgetMutationPayload) => updateProjectBudget(requireToken(token), projectId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectBudgetQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: attentionQueryKey });
    },
    onError: authFailureHandler(logout),
  });
}

export function useUpdateProjectSetupSectionMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ sectionKey, payload }: { sectionKey: string; payload: ProjectSetupSectionStatusPayload }) =>
      updateProjectSetupSection(requireToken(token), projectId, sectionKey, payload),
    onSuccess: (setup) => {
      queryClient.setQueryData(projectSetupQueryKey(projectId), setup);
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
    },
    onError: authFailureHandler(logout),
  });
}

export function useUpdateProjectSetupDetailsMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ section, payload }: { section: ProjectSetupDetailsSection; payload: ProjectSetupDetailsPayload }) =>
      updateProjectSetupDetails(requireToken(token), projectId, section, payload),
    onSuccess: (setup) => {
      queryClient.setQueryData(projectSetupQueryKey(projectId), setup);
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
    },
    onError: authFailureHandler(logout),
  });
}

export function useUpdateProjectSetupBudgetMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: ProjectSetupBudgetPayload) => updateProjectSetupBudget(requireToken(token), projectId, payload),
    onSuccess: (setup) => {
      queryClient.setQueryData(projectSetupQueryKey(projectId), setup);
      void queryClient.invalidateQueries({ queryKey: projectSetupBudgetQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectBudgetQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: attentionQueryKey });
    },
    onError: authFailureHandler(logout),
  });
}

export function useCreateProjectSetupMilestoneMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: ProjectSetupMilestonePayload) => createProjectSetupMilestone(requireToken(token), projectId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectSetupMilestonesQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
    },
    onError: authFailureHandler(logout),
  });
}

export function useCreateProjectSetupDeliverableMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: ProjectSetupDeliverablePayload) => createProjectSetupDeliverable(requireToken(token), projectId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectSetupDeliverablesQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "phases"] });
    },
    onError: authFailureHandler(logout),
  });
}

export function useCreateProjectSetupResourceMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (payload: ProjectSetupResourcePayload) => createProjectSetupResource(requireToken(token), projectId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectSetupResourcesQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
    },
    onError: authFailureHandler(logout),
  });
}

export function useUpdatePhaseBudgetMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: ({ phaseId, payload }: { phaseId: string; payload: PhaseBudgetMutationPayload }) =>
      updatePhaseBudget(requireToken(token), projectId, phaseId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectBudgetQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: attentionQueryKey });
      invalidateProjectDashboardQueries(queryClient, projectId);
    },
    onError: authFailureHandler(logout),
  });
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
      taskIdOverride,
    }: {
      payload: TaskMutationPayload;
      supporterIds: string[];
      currentSupporterIds: string[];
      taskIdOverride?: string;
    }) => {
      const authToken = requireToken(token);
      const targetTaskId = taskIdOverride ?? taskId;
      const task = await updateTask(authToken, projectId, phaseId, targetTaskId, payload);
      const desiredIds = uniqueIds(supporterIds);
      const currentIds = uniqueIds(currentSupporterIds);
      const toAdd = desiredIds.filter((userId) => !currentIds.includes(userId));
      const toRemove = currentIds.filter((userId) => !desiredIds.includes(userId));

      await Promise.all(toAdd.map((userId) => addTaskSupporter(authToken, projectId, phaseId, targetTaskId, userId)));
      await Promise.all(toRemove.map((userId) => removeTaskSupporter(authToken, projectId, phaseId, targetTaskId, userId)));
      return task;
    },
    onSuccess: () => {
      invalidateTaskQueries(queryClient, projectId, phaseId);
      void queryClient.invalidateQueries({ queryKey: taskSupportersQueryKey(projectId, phaseId, taskId) });
    },
    onError: authFailureHandler(logout),
  });
}

export function useUpdateTaskStatusMutation(projectId: string, phaseId: string, taskId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (nextStatus: Task["status"]) => updateTaskStatus(requireToken(token), projectId, phaseId, taskId, nextStatus),
    onSuccess: () => invalidateTaskQueries(queryClient, projectId, phaseId),
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
    mutationFn: ({
      file,
      fileCategory = "work_submission",
      taskIdOverride,
    }: {
      file: File;
      fileCategory?: TaskFile["file_category"];
      taskIdOverride?: string;
    }) => uploadTaskFile(requireToken(token), projectId, phaseId, taskIdOverride ?? taskId, file, fileCategory),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: taskFilesQueryKey(projectId, phaseId, variables.taskIdOverride ?? taskId) });
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
  void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
}

function invalidateWorkspaceQueries(queryClient: ReturnType<typeof useQueryClient>, projectId: string) {
  void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "workspace"] });
  void queryClient.invalidateQueries({ queryKey: projectFilesQueryKey(projectId) });
}

function invalidateTaskQueries(queryClient: ReturnType<typeof useQueryClient>, projectId: string, phaseId: string) {
  void queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId, phaseId) });
  void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
  void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
}

function invalidateChecklistQueries(queryClient: ReturnType<typeof useQueryClient>, projectId: string, phaseId: string, taskId: string) {
  void queryClient.invalidateQueries({ queryKey: checklistQueryKey(projectId, phaseId, taskId) });
  void queryClient.invalidateQueries({ queryKey: tasksQueryKey(projectId, phaseId) });
  void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
  void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
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
    mutationFn: ({ role, userId }: { userId: string; role?: "PM" | "Team Member" | "Finance" }) =>
      addProjectMember(requireToken(token), projectId, userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectMembersQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
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
      void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        logout();
      }
    },
  });
}

export function usePhaseMembersQuery(projectId: string, phaseId: string, enabled: boolean) {
  const { logout, token } = useAuth();
  const query = useQuery({
    queryKey: phaseMembersQueryKey(projectId, phaseId),
    queryFn: () => listPhaseMembers(requireToken(token), projectId, phaseId),
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

export function useAddPhaseMemberMutation(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (userId: string) => addPhaseMember(requireToken(token), projectId, phaseId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: phaseMembersQueryKey(projectId, phaseId) });
      void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
    },
    onError: authFailureHandler(logout),
  });
}

export function useRemovePhaseMemberMutation(projectId: string, phaseId: string) {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();

  return useMutation({
    mutationFn: (userId: string) => removePhaseMember(requireToken(token), projectId, phaseId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: phaseMembersQueryKey(projectId, phaseId) });
      void queryClient.invalidateQueries({ queryKey: projectSetupQueryKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: projectDashboardQueryKey(projectId) });
    },
    onError: authFailureHandler(logout),
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
