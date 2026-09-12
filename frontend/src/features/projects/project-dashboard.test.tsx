import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDashboardPage } from "./project-dashboard";
import type { ProjectMember } from "./types";
import { ApiError } from "@/features/auth/api";

const mocks = vi.hoisted(() => ({
  currentRole: "Team Member" as ProjectMember["role"],
  rolesByProject: {} as Record<string, ProjectMember["role"]>,
  useArchiveProjectMutation: vi.fn(),
  useAttentionQuery: vi.fn(),
  useDownloadProjectFileMutation: vi.fn(),
  usePhaseMembersQuery: vi.fn(),
  useProjectBudgetQuery: vi.fn(),
  useProjectDashboardQuery: vi.fn(),
  useProjectFilesQuery: vi.fn(),
  useProjectMembersQuery: vi.fn(),
  useProjectOverviewQuery: vi.fn(),
  useProjectQuery: vi.fn(),
  useRemovePhaseMemberMutation: vi.fn(),
  useTasksQuery: vi.fn(),
  useUpdatePhaseBudgetMutation: vi.fn(),
  useUpdateProjectBudgetMutation: vi.fn(),
  useUploadTaskFileMutation: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/components/common/confirm-action", () => ({
  ConfirmAction: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/features/users/user-search-select", () => ({
  UserSearchSelect: ({ label }: { label: string }) => <label>{label}</label>,
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

vi.mock("./project-workspace", () => ({
  ProjectWorkspace: ({ canManage, projectId }: { canManage: boolean; projectId: string }) => (
    <div>
      Workspace for {projectId}: {canManage ? "Can manage" : "Read only"}
    </div>
  ),
}));

vi.mock("@/features/auth/hooks", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("./hooks", () => ({
  useAddPhaseMemberMutation: () => ({ error: null, isPending: false, mutateAsync: vi.fn() }),
  useArchiveProjectMutation: mocks.useArchiveProjectMutation,
  useAttentionQuery: mocks.useAttentionQuery,
  useDownloadProjectFileMutation: mocks.useDownloadProjectFileMutation,
  usePhaseMembersQuery: mocks.usePhaseMembersQuery,
  useProjectBudgetQuery: mocks.useProjectBudgetQuery,
  useProjectDashboardQuery: mocks.useProjectDashboardQuery,
  useProjectFilesQuery: mocks.useProjectFilesQuery,
  useProjectMembersQuery: mocks.useProjectMembersQuery,
  useProjectOverviewQuery: mocks.useProjectOverviewQuery,
  useProjectQuery: mocks.useProjectQuery,
  useRemovePhaseMemberMutation: mocks.useRemovePhaseMemberMutation,
  useTasksQuery: mocks.useTasksQuery,
  useUpdatePhaseBudgetMutation: mocks.useUpdatePhaseBudgetMutation,
  useUpdateProjectBudgetMutation: mocks.useUpdateProjectBudgetMutation,
  useUploadTaskFileMutation: mocks.useUploadTaskFileMutation,
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const teamProjectId = "22222222-2222-4222-8222-222222222222";

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
      budget_allocated: 500,
      budget_spent: 125,
      budget_remaining: 375,
      budget_utilisation: 0.25,
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
      budget_allocated: 250,
      budget_spent: 75,
      budget_remaining: 175,
      budget_utilisation: 0.3,
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

const projectOverview = {
  ...projectDetail,
  project_location_area: null,
  scope_in: "Community research",
  scope_out: null,
  scope_boundaries: null,
  scope_notes: null,
  expected_outcomes: "A clear overview for authorized organizational users.",
  success_criteria: null,
  key_indicators: null,
  phases: [{ id: "overview-phase", name: "Discovery", start_date: "2026-01-01", end_date: "2026-03-31", status: "In Progress" }],
  milestones: [],
};

describe("ProjectDashboardPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.currentRole = "Team Member";
    mocks.rolesByProject = {};
    mocks.useAuth.mockReturnValue({ user: { id: "user-1", name: "Team User", email: "team@senseshub.com" } });
    mocks.useProjectDashboardQuery.mockImplementation((requestedProjectId: string) => ({
      data: projectDashboardFor(requestedProjectId),
      isLoading: false,
      isError: false,
    }));
    mocks.useProjectQuery.mockImplementation((requestedProjectId: string) => ({ data: projectDetailFor(requestedProjectId), isLoading: false }));
    mocks.useProjectOverviewQuery.mockReturnValue({ data: null, isLoading: false, isError: false });
    mocks.useProjectMembersQuery.mockImplementation((requestedProjectId: string) => ({
      data: [
        {
          project_id: requestedProjectId,
          user_id: "user-1",
          name: "Team User",
          email: "team@senseshub.com",
          role: mocks.rolesByProject[requestedProjectId] ?? mocks.currentRole,
          joined_at: "2026-01-01T00:00:00Z",
        },
      ],
    }));
    mocks.usePhaseMembersQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
    mocks.useArchiveProjectMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useAttentionQuery.mockReturnValue({
      data: [
        {
          type: "task",
          reason: "Review field plan is overdue",
          project_id: projectId,
          project_name: "Inclusive Speech Tech",
          project_code: "PRJ-2026-001",
          phase_id: "phase-1",
          phase_name: "Discovery",
          task_id: "task-1",
          task_name: "Review field plan",
          assigned_person: { id: "lead-1", name: "Priya PM", email: "pm@senseshub.com" },
          due_date: "2026-09-07",
          severity: "Needs attention",
        },
      ],
      isError: false,
    });
    mocks.useProjectBudgetQuery.mockReturnValue({
      data: { project_id: projectId, allocated: 1000, spent: 200, remaining: 800, utilisation: 0.2 },
      isError: false,
      isLoading: false,
    });
    mocks.useProjectFilesQuery.mockImplementation((requestedProjectId: string) => ({
      data: [
        {
          id: "file-1",
          task_id: "task-1",
          uploaded_by: "pm-1",
          uploader_name: "Priya PM",
          uploader_email: "pm@senseshub.com",
          file_name: "brief.pdf",
          file_type: "application/pdf",
          file_size: 1024,
          file_category: "reference",
          created_at: "2026-09-07T07:03:00Z",
          project_id: requestedProjectId,
          phase_id: "phase-1",
          phase_name: "Discovery",
          task_name: "Review field plan",
        },
      ],
      isError: false,
      isLoading: false,
    }));
    mocks.useDownloadProjectFileMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useTasksQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.useUpdatePhaseBudgetMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useUpdateProjectBudgetMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useUploadTaskFileMutation.mockReturnValue({ error: null, isPending: false, mutateAsync: vi.fn() });
    mocks.useRemovePhaseMemberMutation.mockReturnValue({ error: null, isPending: false, mutate: vi.fn() });
  });

  it("shows summary before detail and does not present one current phase as the only active phase", () => {
    renderProject();

    expect(screen.getByText("Inclusive Speech Tech")).toBeInTheDocument();
    expect(screen.getByText("Make field communication clearer.")).toBeInTheDocument();
    expect(screen.getByText("Discovery")).toBeInTheDocument();
    expect(screen.getByText("Implementation")).toBeInTheDocument();
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(screen.getByText("Discovery / Review field plan / Reference")).toBeInTheDocument();
    expect(screen.getByText(/Uploaded by Priya PM on/)).toBeInTheDocument();
    expect(screen.queryByText("Current Phase")).not.toBeInTheDocument();
    expect(screen.queryByText(projectId)).not.toBeInTheDocument();
    expect(screen.queryByText(/storage key/i)).not.toBeInTheDocument();
  });

  it("shows a read-only overview for a non-member reached from All Projects", () => {
    mocks.useProjectDashboardQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new ApiError("Project access denied", 404),
    });
    mocks.useProjectOverviewQuery.mockReturnValue({ data: projectOverview, isLoading: false, isError: false });

    render(
      <MemoryRouter initialEntries={[`/projects/${teamProjectId}?source=all-projects`]}>
        <Routes>
          <Route path="/projects/:projectId" element={<ProjectDashboardPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("View only")).toBeInTheDocument();
    expect(screen.getByText("Inclusive Speech Tech")).toBeInTheDocument();
    expect(screen.getByText("In scope: Community research")).toBeInTheDocument();
    expect(screen.getByText("Discovery")).toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Project Setup")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|save|manage|add/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("opens Workspace inside the project without changing the project route", () => {
    renderProject();

    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace" }));

    expect(screen.getByText(`Workspace for ${projectId}: Read only`)).toBeInTheDocument();
    expect(screen.queryByText("Files uploaded inside this project.")).not.toBeInTheDocument();
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
    expect(screen.getByText("Project Budget")).toBeInTheDocument();
    expect(screen.getByText("Total Project Utilisation")).toBeInTheDocument();
    expect(screen.getByText("Discovery spent")).toBeInTheDocument();
    expect(screen.getByText("Implementation spent")).toBeInTheDocument();
    expect(screen.getByText("Unutilized")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("uses the opened project's membership role for PM and Team Member modes", () => {
    mocks.rolesByProject = {
      [projectId]: "PM",
      [teamProjectId]: "Team Member",
    };

    const { unmount } = renderProject(projectId);

    expect(screen.getByText("Management Workspace")).toBeInTheDocument();
    expect(screen.getByText("PM")).toBeInTheDocument();
    expect(screen.getByText("Attention Items")).toBeInTheDocument();
    expect(screen.getByText("Active Phases")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "People" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Manage" })).toBeInTheDocument();
    expect(screen.getAllByText(/PM controls/)).toHaveLength(2);

    unmount();
    renderProject(teamProjectId);

    expect(screen.getByText("Team Member")).toBeInTheDocument();
    expect(screen.getByText("Your Work")).toBeInTheDocument();
    expect(screen.queryByText("Management Workspace")).not.toBeInTheDocument();
    expect(screen.queryByText("Attention Items")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "People" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Work view/)).toHaveLength(2);
  });
});

function renderProject(targetProjectId = projectId) {
  return render(
    <MemoryRouter initialEntries={[`/projects/${targetProjectId}`]}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function projectDashboardFor(targetProjectId: string) {
  return {
    ...dashboard,
    project: {
      ...dashboard.project,
      id: targetProjectId,
      code: targetProjectId === teamProjectId ? "PRJ-2026-002" : dashboard.project.code,
      name: targetProjectId === teamProjectId ? "Community Access Rollout" : dashboard.project.name,
    },
    phases: dashboard.phases.map((phase) => ({ ...phase, project_id: targetProjectId })),
  };
}

function projectDetailFor(targetProjectId: string) {
  return {
    ...projectDetail,
    id: targetProjectId,
    code: targetProjectId === teamProjectId ? "PRJ-2026-002" : projectDetail.code,
    name: targetProjectId === teamProjectId ? "Community Access Rollout" : projectDetail.name,
  };
}
