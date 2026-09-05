import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskDetailDrawer } from "./task-detail-drawer";
import type { DashboardPhase, Task } from "./types";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useChecklistQuery: vi.fn(),
  useCreateChecklistItemMutation: vi.fn(),
  useCreateTaskCommentMutation: vi.fn(),
  useDownloadTaskFileMutation: vi.fn(),
  useRemoveChecklistItemMutation: vi.fn(),
  useSetChecklistItemCompletionMutation: vi.fn(),
  useTaskCommentsQuery: vi.fn(),
  useTaskFilesQuery: vi.fn(),
  useTaskSupportersQuery: vi.fn(),
  useUpdateChecklistItemMutation: vi.fn(),
  useUpdateTaskMutation: vi.fn(),
  useUploadTaskFileMutation: vi.fn(),
}));

vi.mock("@/features/auth/hooks", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("./hooks", () => ({
  useChecklistQuery: mocks.useChecklistQuery,
  useCreateChecklistItemMutation: mocks.useCreateChecklistItemMutation,
  useCreateTaskCommentMutation: mocks.useCreateTaskCommentMutation,
  useDownloadTaskFileMutation: mocks.useDownloadTaskFileMutation,
  useRemoveChecklistItemMutation: mocks.useRemoveChecklistItemMutation,
  useSetChecklistItemCompletionMutation: mocks.useSetChecklistItemCompletionMutation,
  useTaskCommentsQuery: mocks.useTaskCommentsQuery,
  useTaskFilesQuery: mocks.useTaskFilesQuery,
  useTaskSupportersQuery: mocks.useTaskSupportersQuery,
  useUpdateChecklistItemMutation: mocks.useUpdateChecklistItemMutation,
  useUpdateTaskMutation: mocks.useUpdateTaskMutation,
  useUploadTaskFileMutation: mocks.useUploadTaskFileMutation,
}));

const phase: DashboardPhase = {
  id: "22222222-2222-4222-8222-222222222222",
  project_id: "11111111-1111-4111-8111-111111111111",
  name: "Discovery",
  description: "Phase description",
  owner_id: null,
  owner: null,
  start_date: "2026-09-01",
  end_date: "2026-09-30",
  status: "In Progress",
  display_order: 1,
  objectives: null,
  progress: 50,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  archived_at: null,
};

const task: Task = {
  id: "33333333-3333-4333-8333-333333333333",
  project_id: phase.project_id,
  phase_id: phase.id,
  name: "Review field plan",
  description: "Confirm the field plan and upload the reviewed copy.",
  owner_id: "user-1",
  owner: { id: "user-1", name: "Team User", email: "team@senseshub.com" },
  priority: "Medium",
  status: "In Progress",
  start_date: "2026-09-03",
  due_date: "2026-09-07",
  completed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("TaskDetailDrawer", () => {
  beforeEach(() => {
    mocks.useAuth.mockReturnValue({ user: { id: "user-1", name: "Team User", email: "team@senseshub.com" } });
    mocks.useChecklistQuery.mockReturnValue({
      data: {
        summary: { completed_items: 0, total_items: 1, progress: 0 },
        items: [
          {
            id: "checklist-1",
            task_id: task.id,
            description: "Confirm partner availability",
            is_completed: false,
            display_order: 1,
            completed_at: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      error: null,
      isLoading: false,
    });
    mocks.useTaskCommentsQuery.mockReturnValue({ data: [], error: null, isLoading: false });
    mocks.useTaskFilesQuery.mockReturnValue({
      data: [
        {
          id: "file-1",
          task_id: task.id,
          file_name: "brief.pdf",
          file_type: "application/pdf",
          file_size: 1024,
          file_category: "reference",
          uploader_id: "pm-1",
          uploader_name: "Priya PM",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "file-2",
          task_id: task.id,
          file_name: "reviewed-plan.docx",
          file_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          file_size: 2048,
          file_category: "work_submission",
          uploader_id: "user-1",
          uploader_name: "Team User",
          created_at: "2026-01-02T00:00:00Z",
        },
      ],
      error: null,
      isLoading: false,
    });
    mocks.useTaskSupportersQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.useCreateChecklistItemMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useCreateTaskCommentMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useDownloadTaskFileMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useRemoveChecklistItemMutation.mockReturnValue({ error: null, isPending: false, mutate: vi.fn() });
    mocks.useSetChecklistItemCompletionMutation.mockReturnValue({ error: null, isPending: false, mutate: vi.fn() });
    mocks.useUpdateChecklistItemMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useUpdateTaskMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useUploadTaskFileMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
  });

  it("shows task instructions, assignment, due date, checklist, files, and upload area without raw IDs", async () => {
    render(
      <TaskDetailDrawer isProjectPm={false} phase={phase} projectId={phase.project_id} task={task}>
        <button type="button">View task</button>
      </TaskDetailDrawer>,
    );

    fireEvent.click(screen.getByRole("button", { name: "View task" }));

    expect(await screen.findByRole("heading", { name: "What you need to do" })).toBeInTheDocument();
    expect(screen.getByText("Confirm the field plan and upload the reviewed copy.")).toBeInTheDocument();
    expect(screen.getByText("Assigned to")).toBeInTheDocument();
    expect(screen.getAllByText("Team User").length).toBeGreaterThan(0);
    expect(screen.getByText("Due")).toBeInTheDocument();
    expect(screen.getByText("Checklist")).toBeInTheDocument();
    expect(screen.getByText("Files needed for this task")).toBeInTheDocument();
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(screen.getByText("Your Work")).toBeInTheDocument();
    expect(screen.getByLabelText("Upload your work")).toBeInTheDocument();
    expect(screen.getByText("reviewed-plan.docx")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByText(task.id)).not.toBeInTheDocument();
    expect(screen.queryByText(/storage key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/backend/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/deliverable/i)).not.toBeInTheDocument();
  });
});
