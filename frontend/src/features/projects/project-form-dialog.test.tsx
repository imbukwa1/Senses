import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProjectFormDialog } from "./project-form-dialog";

const createMutation = {
  error: null,
  isPending: false,
  mutateAsync: vi.fn(),
  reset: vi.fn(),
};

const updateMutation = {
  error: null,
  isPending: false,
  mutateAsync: vi.fn(),
  reset: vi.fn(),
};

vi.mock("@/features/auth/hooks", () => ({
  useAuth: () => ({
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Authenticated User",
      email: "user@senseshub.com",
    },
  }),
}));

vi.mock("./hooks", () => ({
  useCreateProjectMutation: () => createMutation,
  useUpdateProjectMutation: () => updateMutation,
}));

describe("ProjectFormDialog", () => {
  it("keeps project creation simple and backend-authoritative", async () => {
    createMutation.mutateAsync.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Simple Project",
      description: "Simple description",
      project_lead_id: "11111111-1111-4111-8111-111111111111",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      status: "Planning",
    });
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ProjectFormDialog mode="create" open onOpenChange={vi.fn()}>
          <button type="button">New Project</button>
        </ProjectFormDialog>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Create Project" })).toBeInTheDocument();
    expect(screen.queryByText("Project Lead")).not.toBeInTheDocument();
    expect(screen.queryByText("Project Code")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/project name/i), "Simple Project");
    await userEvent.type(screen.getByLabelText(/description/i), "Simple description");
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-01-01");
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-12-31");
    await userEvent.click(screen.getByRole("button", { name: /create project/i }));

    expect(createMutation.mutateAsync).toHaveBeenCalledWith(
      expect.not.objectContaining({
        project_lead_id: expect.any(String),
        code: expect.any(String),
        role: expect.any(String),
      }),
    );
  });
});
