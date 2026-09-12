import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectPortfolio } from "./project-portfolio";

const mocks = vi.hoisted(() => ({
  useProjectDashboardQuery: vi.fn(),
  useAllProjectsQuery: vi.fn(),
  useProjectsQuery: vi.fn(),
}));

vi.mock("./hooks", () => ({
  useProjectDashboardQuery: mocks.useProjectDashboardQuery,
  useAllProjectsQuery: mocks.useAllProjectsQuery,
  useProjectsQuery: mocks.useProjectsQuery,
}));

const project = {
  id: "11111111-1111-4111-8111-111111111111",
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

afterEach(() => cleanup());

describe("ProjectPortfolio", () => {
  beforeEach(() => {
    mocks.useProjectsQuery.mockReturnValue({ data: [project], isLoading: false, isError: false });
    mocks.useAllProjectsQuery.mockReturnValue({ data: [project], isLoading: false, isError: false });
    mocks.useProjectDashboardQuery.mockReturnValue({
      data: {
        project: { overall_progress: 64 },
        phases: [
          { id: "phase-1", status: "In Progress" },
          { id: "phase-2", status: "Completed" },
        ],
      },
    });
  });

  it("shows a simple project summary without admin-heavy fields", () => {
    render(
      <MemoryRouter>
        <ProjectPortfolio />
      </MemoryRouter>,
    );

    expect(screen.getByText("Inclusive Speech Tech")).toBeInTheDocument();
    expect(screen.getByText(/PRJ-2026-001/)).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Review field plan is overdue")).toBeInTheDocument();
    expect(screen.getByText("64%")).toBeInTheDocument();
    expect(screen.getByText(/1 active phase/)).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.queryByText(project.id)).not.toBeInTheDocument();
    expect(screen.queryByText("Priority")).not.toBeInTheDocument();
    expect(screen.queryByText("End Date")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /archive/i })).not.toBeInTheDocument();
  });

  it("switches between grid and compact list using the same project", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ProjectPortfolio /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("64% progress")).toBeInTheDocument();
    expect(screen.getAllByRole("link").find((link) => link.getAttribute("href") === `/projects/${project.id}`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Grid view" }));
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("64%")).toBeInTheDocument();
  });

  it("shows authorized projects in the read-only All Projects overview", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ProjectPortfolio /></MemoryRouter>);

    await user.click(screen.getByRole("tab", { name: "All Projects" }));
    expect(screen.getByText("Project description")).toBeInTheDocument();
    expect(screen.getByText("Lead: Priya PM")).toBeInTheDocument();
    expect(screen.getAllByRole("link").find((link) => link.getAttribute("href") === `/projects/${project.id}?source=all-projects`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|create|delete/i })).not.toBeInTheDocument();
  });
});
