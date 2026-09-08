import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectWorkspace } from "./project-workspace";
import type { WorkspaceContents, WorkspaceFolder } from "./types";

const mocks = vi.hoisted(() => ({
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  downloadFile: vi.fn(),
  moveFile: vi.fn(),
  updateFolder: vi.fn(),
  workspaceError: null as Error | null,
  workspaceByFolder: {} as Record<string, WorkspaceContents>,
}));

vi.mock("./hooks", () => ({
  useCreateWorkspaceFolderMutation: () => ({ error: null, isPending: false, mutateAsync: mocks.createFolder }),
  useDeleteWorkspaceFolderMutation: () => ({ error: null, isPending: false, mutateAsync: mocks.deleteFolder }),
  useDownloadProjectFileMutation: () => ({ error: null, isPending: false, mutateAsync: mocks.downloadFile }),
  useMoveWorkspaceFileMutation: () => ({ error: null, isPending: false, mutateAsync: mocks.moveFile }),
  useUpdateWorkspaceFolderMutation: () => ({ error: null, isPending: false, mutateAsync: mocks.updateFolder }),
  useWorkspaceContentsQuery: (_projectId: string, folderId: string | null) => ({
    data: mocks.workspaceByFolder[folderId ?? "root"],
    error: mocks.workspaceError,
    isError: Boolean(mocks.workspaceError),
    isLoading: false,
  }),
  useWorkspaceFolderTreeQuery: () => ({
    data: Object.values(mocks.workspaceByFolder).flatMap((contents) => contents.folders),
    error: null,
    isError: false,
    isLoading: false,
  }),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const taskId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

const rootFolder: WorkspaceFolder = {
  id: "44444444-4444-4444-8444-444444444444",
  project_id: projectId,
  parent_folder_id: null,
  name: "Research",
  created_by: userId,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const childFolder: WorkspaceFolder = {
  id: "55555555-5555-4555-8555-555555555555",
  project_id: projectId,
  parent_folder_id: rootFolder.id,
  name: "Participant Data",
  created_by: userId,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const rootFile = {
  id: "66666666-6666-4666-8666-666666666666",
  task_id: taskId,
  uploaded_by: userId,
  uploader_name: "Grace",
  uploader_email: "grace@example.com",
  file_name: "brief.pdf",
  file_type: "application/pdf",
  file_size: 1024,
  file_category: "reference" as const,
  created_at: "2026-01-01T00:00:00Z",
  project_id: projectId,
  phase_id: "77777777-7777-4777-8777-777777777777",
  phase_name: "Discovery",
  task_name: "Review field plan",
  folder_id: null,
};

describe("ProjectWorkspace", () => {
  beforeEach(() => {
    mocks.createFolder.mockResolvedValue(rootFolder);
    mocks.deleteFolder.mockResolvedValue(undefined);
    mocks.downloadFile.mockResolvedValue({ blob: new Blob(["content"]), fileName: "brief.pdf" });
    mocks.moveFile.mockResolvedValue(rootFile);
    mocks.updateFolder.mockResolvedValue(rootFolder);
    mocks.workspaceError = null;
    mocks.workspaceByFolder = {
      root: { folders: [rootFolder], files: [rootFile] },
      [rootFolder.id]: { folders: [childFolder], files: [] },
      [childFolder.id]: { folders: [], files: [] },
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("displays root folders, root files, nested folders, and breadcrumbs", () => {
    render(<ProjectWorkspace canManage projectId={projectId} />);

    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(screen.getByText("Discovery / Review field plan")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open folder Research" }));

    expect(screen.getByText("Participant Data")).toBeInTheDocument();
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Workspace" }));

    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
  });

  it("creates a folder in the current workspace location after backend confirmation", async () => {
    render(<ProjectWorkspace canManage projectId={projectId} />);

    fireEvent.click(screen.getByRole("button", { name: "New Folder" }));
    fireEvent.change(screen.getByLabelText("Folder Name"), { target: { value: "New Research" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Folder" }));

    await waitFor(() => {
      expect(mocks.createFolder).toHaveBeenCalledWith({ name: "New Research", parent_folder_id: null });
    });
  });

  it("hides management controls for read-only project members", () => {
    render(<ProjectWorkspace canManage={false} projectId={projectId} />);

    expect(screen.queryByRole("button", { name: "New Folder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download brief.pdf" })).toBeInTheDocument();
  });

  it("surfaces backend workspace errors", () => {
    mocks.workspaceError = new Error("network down");

    render(<ProjectWorkspace canManage projectId={projectId} />);

    expect(screen.getByText("Workspace could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("Unable to reach the server. Please try again.")).toBeInTheDocument();
  });
});
