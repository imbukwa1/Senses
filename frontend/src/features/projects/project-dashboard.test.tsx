import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDashboardPage } from "./project-dashboard";
import type { ProjectMember } from "./types";

const mocks = vi.hoisted(() => ({
  currentRole: "Team Member" as ProjectMember["role"],
  useArchiveProjectMutation: vi.fn(),
  useAttentionQuery: vi.fn(),
  usePhaseMembersQuery: vi.fn(),
  useProjectBudgetQuery: vi.fn(),
  useProjectDashboardQuery: vi.fn(),
  useProjectMembersQuery: vi.fn(),
  useProjectQuery: vi.fn(),
  useRemovePhaseMemberMutation: vi.fn(),
  useUpdateProjectBudgetMutation: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/components/common/confirm-action", () => ({
  ConfirmAction: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./phase-management-dialog", () => ({
  PhaseManagementDialog: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./phase-tasks", () => ({
  PhaseTasks: ({ isProjectPm, phase }: { isProjectPm: boolean; phase: { name: string } }) => (
    <div>
      Tasks for {phase.name}: {isProjectPm ? "PM controls" : "Work view"}
    </div>
  ),
}));

vi.mock("./project-form-dialog", () => ({
  ProjectFormDialog: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./project-members-dialog", () => ({
  ProjectMembersDialog: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/features/auth/hooks", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("./hooks", () => ({
  useAddPhaseMemberMutation: () => ({ error: null, isPending: false, mutateAsync: vi.fn() }),
  useArchiveProjectMutation: mocks.useArchiveProjectMutation,
  useAttentionQuery: mocks.useAttentionQuery,
  usePhaseMembersQuery: mocks.usePhaseMembersQuery,
  useProjectBudgetQuery: mocks.useProjectBudgetQuery,
  useProjectDashboardQuery: mocks.useProjectDashboardQuery,
  useProjectMembersQuery: mocks.useProjectMembersQuery,
  useProjectQuery: mocks.useProjectQuery,
  useRemovePhaseMemberMutation: mocks.useRemovePhaseMemberMutation,
  useUpdateProjectBudgetMutation: mocks.useUpdateProjectBudgetMutation,
}));

const projectId = "11111111-1111-4111-8111-111111111111";

const dashboard = {
  project: {
    id: projectId,
    code: "PRJ-2026-001",
    name: "Inclusive Speech Tech",
    description: "Project description",
    project_lead: { id: "lead-1", name: "Priya PM", email: "pm@senseshub.com" },
    status: "Active",
    health: "At Risk",
    health_color: "warning",
    health_label: "Needs attention",
    health_reasons: ["Review field plan is overdue"],
    overall_progress: 64,
    current_phase_id: "phase-1",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    priority: "Medium",
    archived_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  current_phase: null,
  upcoming_deadlines: [],
  phases: [
    {
      id: "phase-1",
      project_id: projectId,
      name: "Discovery",
      description: "Discovery work",
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
    },
    {
      id: "phase-2",
      project_id: projectId,
      name: "Implementation",
      description: "Implementation work",
      owner_id: null,
      owner: null,
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      status: "In Progress",
      display_order: 2,
      objectives: null,
      progress: 10,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      archived_at: null,
    },
  ],
  deliverables: [],
};

const projectDetail = {
  id: projectId,
  code: "PRJ-2026-001",
  name: "Inclusive Speech Tech",
  description: "Project description",
  project_lead_id: "lead-1",
  project_lead: { id: "lead-1", name: "Priya PM", email: "pm@senseshub.com" },
  current_phase_id: "phase-1",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  status: "Active",
  health: "At Risk",
  health_color: "warning",
  health_label: "Needs attention",
  health_reasons: ["Review field plan is overdue"],
  funder_partner: null,
  project_type: null,
  objectives: "Make field communication clearer.",
  priority: "Medium",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  archived_at: null,
};

describe("ProjectDashboardPage", () => {
  beforeEach(() => {
    mocks.currentRole = "Team Member";
    mocks.useAuth.mockReturnValue({ user: { id: "user-1", name: "Team User", email: "team@senseshub.com" } });
    mocks.useProjectDashboardQuery.mockReturnValue({ data: dashboard, isLoading: false, isError: false });
    mocks.useProjectQuery.mockReturnValue({ data: projectDetail, isLoading: false });
    mocks.useProjectMembersQuery.mockImplementation(() => ({
      data: [
        {
          project_id: projectId,
          user_id: "user-1",
          name: "Team User",
          email: "team@senseshub.com",
          role: mocks.currentRole,
          joined_at: "2026-01-01T00:00:00Z",
        },
      ],
    }));
    mocks.usePhaseMembersQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
    mocks.useArchiveProjectMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useAttentionQuery.mockReturnValue({ data: [{ project_id: projectId }], isError: false });
    mocks.useProjectBudgetQuery.mockReturnValue({
      data: { project_id: projectId, allocated: 1000, spent: 200, remaining: 800, utilisation: 0.2 },
      isError: false,
      isLoading: false,
    });
    mocks.useUpdateProjectBudgetMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useRemovePhaseMemberMutation.mockReturnValue({ error: null, isPending: false, mutate: vi.fn() });
  });

  it("shows summary before detail and does not present one current phase as the only active phase", () => {
    renderProject();

    expect(screen.getByText("Inclusive Speech Tech")).toBeInTheDocument();
    expect(screen.getByText("Make field communication clearer.")).toBeInTheDocument();
    expect(screen.getByText("Discovery")).toBeInTheDocument();
    expect(screen.getByText("Implementation")).toBeInTheDocument();
    expect(screen.queryByText("Current Phase")).not.toBeInTheDocument();
    expect(screen.queryByText(projectId)).not.toBeInTheDocument();
  });

  it("hides PM management controls from Team Member and Finance roles", () => {
    renderProject();

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "People" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();

    mocks.currentRole = "Finance";
    renderProject();

    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "People" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
  });
});

function renderProject() {
  render(
    <MemoryRouter initialEntries={[`/projects/${projectId}`]}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
