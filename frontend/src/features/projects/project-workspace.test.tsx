import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectWorkspace } from "./project-workspace";
import type { WorkspaceContents, WorkspaceFolder } from "./types";

const mocks = vi.hoisted(() => ({
  createFolder: vi.fn(),
  createDocument: vi.fn(),
  createSpreadsheet: vi.fn(),
  deleteDocument: vi.fn(),
  deleteFolder: vi.fn(),
  deleteSpreadsheet: vi.fn(),
  downloadFile: vi.fn(),
  moveDocument: vi.fn(),
  moveFile: vi.fn(),
  moveSpreadsheet: vi.fn(),
  renameDocument: vi.fn(),
  renameSpreadsheet: vi.fn(),
  updateDocumentTaskLink: vi.fn(),
  updateFolder: vi.fn(),
  updateSpreadsheetTaskLink: vi.fn(),
  workspaceError: null as Error | null,
  workspaceByFolder: {} as Record<string, WorkspaceContents>,
  taskOptions: [] as { task: { id: string; name: string; status: string }; phaseName: string }[],
}));

vi.mock("./hooks", () => ({
  useCreateWorkspaceFolderMutation: () => ({ error: null, isPending: false, mutateAsync: mocks.createFolder }),
  useCreateWorkspaceNativeResourceMutation: (_projectId: string, kind: "documents" | "spreadsheets") => ({
    error: null,
    isPending: false,
    mutateAsync: kind === "documents" ? mocks.createDocument : mocks.createSpreadsheet,
  }),
  useDeleteWorkspaceFolderMutation: () => ({ error: null, isPending: false, mutateAsync: mocks.deleteFolder }),
  useDeleteWorkspaceNativeResourceMutation: (_projectId: string, kind: "documents" | "spreadsheets") => ({
    error: null,
    isPending: false,
    mutateAsync: kind === "documents" ? mocks.deleteDocument : mocks.deleteSpreadsheet,
  }),
  useDownloadProjectFileMutation: () => ({ error: null, isPending: false, mutateAsync: mocks.downloadFile }),
  useMoveWorkspaceFileMutation: () => ({ error: null, isPending: false, mutateAsync: mocks.moveFile }),
  useMoveWorkspaceNativeResourceMutation: (_projectId: string, kind: "documents" | "spreadsheets") => ({
    error: null,
    isPending: false,
    mutateAsync: kind === "documents" ? mocks.moveDocument : mocks.moveSpreadsheet,
  }),
  useProjectTaskOptionsQuery: () => ({ data: mocks.taskOptions, error: null, isError: false, isLoading: false }),
  useRenameWorkspaceNativeResourceMutation: (_projectId: string, kind: "documents" | "spreadsheets") => ({
    error: null,
    isPending: false,
    mutateAsync: kind === "documents" ? mocks.renameDocument : mocks.renameSpreadsheet,
  }),
  useUpdateWorkspaceNativeResourceTaskLinkMutation: (_projectId: string, kind: "documents" | "spreadsheets") => ({
    error: null,
    isPending: false,
    mutateAsync: kind === "documents" ? mocks.updateDocumentTaskLink : mocks.updateSpreadsheetTaskLink,
  }),
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

vi.mock("./workspace-native-editors", () => ({
  WorkspaceDocumentEditor: ({ onBack, resourceId }: { onBack: () => void; resourceId: string }) => (
    <div>
      <p>Document editor {resourceId}</p>
      <button type="button" onClick={onBack}>
        Workspace
      </button>
    </div>
  ),
  WorkspaceSpreadsheetEditor: ({ onBack, resourceId }: { onBack: () => void; resourceId: string }) => (
    <div>
      <p>Spreadsheet editor {resourceId}</p>
      <button type="button" onClick={onBack}>
        Workspace
      </button>
    </div>
  ),
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

const rootDocument = {
  id: "88888888-8888-4888-8888-888888888888",
  project_id: projectId,
  folder_id: null,
  task_id: null,
  name: "Interview Notes",
  content: { type: "doc", content: [{ type: "paragraph" }] },
  created_by: userId,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

const childSpreadsheet = {
  id: "99999999-9999-4999-8999-999999999999",
  project_id: projectId,
  folder_id: rootFolder.id,
  task_id: taskId,
  name: "Participant Tracker",
  content: { id: "workbook", sheetOrder: [], sheets: {} },
  created_by: userId,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

describe("ProjectWorkspace", () => {
  beforeEach(() => {
    mocks.createFolder.mockResolvedValue(rootFolder);
    mocks.createDocument.mockResolvedValue(rootDocument);
    mocks.createSpreadsheet.mockResolvedValue(childSpreadsheet);
    mocks.deleteFolder.mockResolvedValue(undefined);
    mocks.deleteDocument.mockResolvedValue(undefined);
    mocks.deleteSpreadsheet.mockResolvedValue(undefined);
    mocks.downloadFile.mockResolvedValue({ blob: new Blob(["content"]), fileName: "brief.pdf" });
    mocks.moveDocument.mockResolvedValue(rootDocument);
    mocks.moveFile.mockResolvedValue(rootFile);
    mocks.moveSpreadsheet.mockResolvedValue(childSpreadsheet);
    mocks.renameDocument.mockResolvedValue(rootDocument);
    mocks.renameSpreadsheet.mockResolvedValue(childSpreadsheet);
    mocks.updateDocumentTaskLink.mockResolvedValue(rootDocument);
    mocks.updateFolder.mockResolvedValue(rootFolder);
    mocks.updateSpreadsheetTaskLink.mockResolvedValue(childSpreadsheet);
    mocks.workspaceError = null;
    mocks.taskOptions = [];
    mocks.workspaceByFolder = {
      root: { folders: [rootFolder], files: [rootFile], documents: [rootDocument], spreadsheets: [] },
      [rootFolder.id]: { folders: [childFolder], files: [], documents: [], spreadsheets: [childSpreadsheet] },
      [childFolder.id]: { folders: [], files: [], documents: [], spreadsheets: [] },
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
    expect(screen.getByText("Interview Notes")).toBeInTheDocument();
    expect(screen.getByText("Document")).toBeInTheDocument();
    expect(screen.getByText("Discovery / Review field plan")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open folder Research" }));

    expect(screen.getByText("Participant Data")).toBeInTheDocument();
    expect(screen.getByText("Participant Tracker")).toBeInTheDocument();
    expect(screen.getByText("Spreadsheet")).toBeInTheDocument();
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

  it("links a resource using a project task name and supports unlinking", async () => {
    mocks.taskOptions = [
      { task: { id: taskId, name: "Review field plan", status: "Not Started" }, phaseName: "Discovery" },
      { task: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Review field plan", status: "In Progress" }, phaseName: "Delivery" },
    ];
    render(<ProjectWorkspace canManage projectId={projectId} />);

    fireEvent.click(screen.getByRole("button", { name: "Link Task" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Workspace task link" }));
    expect(screen.getByText("Review field plan — Discovery (Not Started)")).toBeInTheDocument();
    expect(screen.getByText("Review field plan — Delivery (In Progress)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Review field plan — Discovery (Not Started)"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateDocumentTaskLink).toHaveBeenCalledWith({ resourceId: rootDocument.id, payload: { task_id: taskId } });
    });

    fireEvent.click(screen.getByRole("button", { name: "Link Task" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Workspace task link" }));
    fireEvent.click(screen.getAllByText("No task / Unlink task").at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.updateDocumentTaskLink).toHaveBeenLastCalledWith({ resourceId: rootDocument.id, payload: { task_id: null } });
    });
  });

  it("creates and opens native documents in the current workspace location", async () => {
    render(<ProjectWorkspace canManage={false} projectId={projectId} />);

    fireEvent.click(screen.getByRole("button", { name: "New Document" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Session Notes" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Document" }));

    await waitFor(() => {
      expect(mocks.createDocument).toHaveBeenCalledWith({
        content: { type: "doc", content: [{ type: "paragraph" }] },
        folder_id: null,
        name: "Session Notes",
        task_id: null,
      });
    });
    expect(await screen.findByText(`Document editor ${rootDocument.id}`)).toBeInTheDocument();
  });

  it("opens existing native resources without using uploaded file behavior", () => {
    render(<ProjectWorkspace canManage projectId={projectId} />);

    fireEvent.click(screen.getByRole("button", { name: "Open document Interview Notes" }));

    expect(screen.getByText(`Document editor ${rootDocument.id}`)).toBeInTheDocument();
    expect(mocks.downloadFile).not.toHaveBeenCalled();
  });

  it("hides management controls for read-only project members", () => {
    render(<ProjectWorkspace canManage={false} projectId={projectId} />);

    expect(screen.queryByRole("button", { name: "New Folder" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Document" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Spreadsheet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download brief.pdf" })).toBeInTheDocument();
  });

  it("surfaces backend workspace errors", () => {
    mocks.workspaceError = new Error("network down");

    render(<ProjectWorkspace canManage projectId={projectId} />);

    expect(screen.getByText("Workspace could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("Unable to reach the server. Please try again.")).toBeInTheDocument();
  });
});
