import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomePage } from "./home-page";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useAttentionQuery: vi.fn(),
  useMyWorkQuery: vi.fn(),
  useProjectDashboardQuery: vi.fn(),
  useProjectsQuery: vi.fn(),
}));

vi.mock("@/features/auth/hooks", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/features/projects/hooks", () => ({
  useAttentionQuery: mocks.useAttentionQuery,
  useMyWorkQuery: mocks.useMyWorkQuery,
  useProjectDashboardQuery: mocks.useProjectDashboardQuery,
  useProjectsQuery: mocks.useProjectsQuery,
}));

const project = {
  id: "project-1",
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
  objectives: null,
  priority: "Medium",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  archived_at: null,
};

const myWorkItem = {
  task_id: "task-1",
  task_name: "Review field plan",
  project_id: project.id,
  project_name: project.name,
  project_code: project.code,
  phase_id: "phase-1",
  phase_name: "Discovery",
  due_date: "2026-09-07",
  status: "In Progress",
  relationship: "owner",
  overdue: false,
  action_label: "Due soon",
};

const attentionItem = {
  type: "task",
  reason: "Review field plan is overdue",
  project_id: project.id,
  project_name: project.name,
  project_code: project.code,
  phase_id: "phase-1",
  phase_name: "Discovery",
  task_id: "task-1",
  task_name: "Review field plan",
  assigned_person: { id: "user-1", name: "Team User", email: "team@senseshub.com" },
  due_date: "2026-09-01",
  severity: "Needs attention",
};

describe("HomePage", () => {
  beforeEach(() => {
    mocks.useAuth.mockReturnValue({ user: { id: "user-1", name: "Team User", email: "team@senseshub.com" } });
    mocks.useProjectsQuery.mockReturnValue({ data: [project], isLoading: false, isError: false });
    mocks.useMyWorkQuery.mockReturnValue({ data: [myWorkItem], isLoading: false, isError: false });
    mocks.useAttentionQuery.mockReturnValue({ data: [attentionItem], isLoading: false, isError: false });
    mocks.useProjectDashboardQuery.mockReturnValue({
      data: { project: { overall_progress: 42 } },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the team member home summary with scoped projects and work", () => {
    renderHome();

    expect(screen.getByText("Hello, Team User")).toBeInTheDocument();
    expect(screen.getByText("Inclusive Speech Tech")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Review field plan")).toBeInTheDocument();
    expect(screen.getAllByText("Review field plan is overdue").length).toBeGreaterThan(0);
  });

  it("renders PM home with attention and project progress summaries", () => {
    mocks.useAuth.mockReturnValue({ user: { id: "pm-1", name: "Priya PM", email: "pm@senseshub.com" } });

    renderHome();

    expect(screen.getByText("Hello, Priya PM")).toBeInTheDocument();
    expect(screen.getByLabelText("Attention summary")).toHaveTextContent("1");
    expect(screen.getByText("Relevant project health and progress")).toBeInTheDocument();
  });

  it("renders finance home without budget management content", () => {
    mocks.useAuth.mockReturnValue({ user: { id: "finance-1", name: "Finance User", email: "finance@senseshub.com" } });
    mocks.useMyWorkQuery.mockReturnValue({ data: [], isLoading: false, isError: false });

    renderHome();

    expect(screen.getByText("Hello, Finance User")).toBeInTheDocument();
    expect(screen.getByText("Inclusive Speech Tech")).toBeInTheDocument();
    expect(screen.queryByText(/budget/i)).not.toBeInTheDocument();
  });

  it("links summaries back to Attention, My Work, and project context", () => {
    renderHome();

    expect(screen.getAllByRole("link", { name: /attention/i })[0]).toHaveAttribute("href", "/attention");
    expect(screen.getAllByRole("link", { name: /my work/i })[0]).toHaveAttribute("href", "/my-work");
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));

    expect(hrefs).toContain("/projects/project-1");
    expect(hrefs).toContain("/projects/project-1?phase=phase-1&task=task-1");
  });
});

function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}
