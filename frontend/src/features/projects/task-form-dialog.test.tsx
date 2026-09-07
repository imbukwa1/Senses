import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskFormDialog } from "./task-form-dialog";
import type { DashboardPhase, Task } from "./types";

const mocks = vi.hoisted(() => ({
  useCreateTaskMutation: vi.fn(),
  useProjectMembersQuery: vi.fn(),
  useTaskSupportersQuery: vi.fn(),
  useUpdateTaskMutation: vi.fn(),
  useUploadTaskFileMutation: vi.fn(),
}));

vi.mock("./hooks", () => ({
  useCreateTaskMutation: mocks.useCreateTaskMutation,
  useProjectMembersQuery: mocks.useProjectMembersQuery,
  useTaskSupportersQuery: mocks.useTaskSupportersQuery,
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

const owner = {
  project_id: phase.project_id,
  user_id: "33333333-3333-4333-8333-333333333333",
  name: "Owner User",
  email: "owner@senseshub.com",
  role: "Team Member" as const,
  joined_at: "2026-01-01T00:00:00Z",
};

const task: Task = {
  id: "44444444-4444-4444-8444-444444444444",
  project_id: phase.project_id,
  phase_id: phase.id,
  name: "Review field plan",
  description: "Confirm the field plan.",
  owner_id: owner.user_id,
  owner: { id: owner.user_id, name: owner.name, email: owner.email },
  priority: "Medium",
  status: "Not Started",
  start_date: null,
  due_date: "2026-09-15",
  completed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("TaskFormDialog", () => {
  beforeAll(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
  });

  beforeEach(() => {
    mocks.useProjectMembersQuery.mockReturnValue({ data: [owner], error: null, isLoading: false });
    mocks.useTaskSupportersQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.useCreateTaskMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({
        id: "44444444-4444-4444-8444-444444444444",
        phase_id: phase.id,
        project_id: phase.project_id,
        name: "Review field plan",
      }),
      reset: vi.fn(),
    });
    mocks.useUpdateTaskMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(task),
      reset: vi.fn(),
    });
    mocks.useUploadTaskFileMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({ file_category: "reference" }),
      reset: vi.fn(),
    });
  });

  it("lets a PM select, remove, and attach reference files when editing a task", async () => {
    const user = userEvent.setup();
    const firstFile = new File(["brief"], "brief.pdf", { type: "application/pdf" });
    const secondFile = new File(["scope"], "scope.txt", { type: "text/plain" });
    const updateTask = mocks.useUpdateTaskMutation();
    const uploadReferenceFile = mocks.useUploadTaskFileMutation();

    render(
      <TaskFormDialog mode="edit" projectId={phase.project_id} phase={phase} task={task}>
        <button type="button">Edit Task</button>
      </TaskFormDialog>,
    );

    await user.click(screen.getByRole("button", { name: "Edit Task" }));
    await user.upload(screen.getByLabelText("Add reference file"), [firstFile, secondFile]);

    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(screen.getByText("scope.txt")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove scope.txt" }));

    expect(screen.queryByText("scope.txt")).not.toBeInTheDocument();

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save Changes" }));

    expect(updateTask.mutateAsync).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        name: "Review field plan",
        owner_id: owner.user_id,
      }),
      currentSupporterIds: [],
      supporterIds: [],
    });
    expect(uploadReferenceFile.mutateAsync).toHaveBeenCalledWith({
      file: firstFile,
      fileCategory: "reference",
      taskIdOverride: task.id,
    });
    expect(uploadReferenceFile.mutateAsync).not.toHaveBeenCalledWith(expect.objectContaining({ fileCategory: "work_submission" }));
  });
});
