import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchPage } from "./search-page";

const mocks = vi.hoisted(() => ({
  useSearchQuery: vi.fn(),
}));

vi.mock("@/features/search/hooks", () => ({
  normalizeSearchQuery: (query: string) => query.trim().replace(/\s+/g, " "),
  useSearchQuery: mocks.useSearchQuery,
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const phaseId = "22222222-2222-4222-8222-222222222222";
const taskId = "33333333-3333-4333-8333-333333333333";

describe("SearchPage", () => {
  beforeEach(() => {
    mocks.useSearchQuery.mockReturnValue({
      data: [
        {
          result_type: "project",
          project_id: projectId,
          project_code: "PRJ-2026-001",
          project_name: "River Atlas",
          phase_id: null,
          phase_name: null,
          task_id: null,
          task_name: null,
          status: "Active",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          result_type: "phase",
          project_id: projectId,
          project_code: "PRJ-2026-001",
          project_name: "River Atlas",
          phase_id: phaseId,
          phase_name: "Baseline Survey",
          task_id: null,
          task_name: null,
          status: "In Progress",
          created_at: "2026-01-02T00:00:00Z",
          updated_at: "2026-01-02T00:00:00Z",
        },
        {
          result_type: "task",
          project_id: projectId,
          project_code: "PRJ-2026-001",
          project_name: "River Atlas",
          phase_id: phaseId,
          phase_name: "Baseline Survey",
          task_id: taskId,
          task_name: "Validate Sensor Packet",
          status: "Not Started",
          created_at: "2026-01-03T00:00:00Z",
          updated_at: "2026-01-03T00:00:00Z",
        },
      ],
      isError: false,
      isLoading: false,
      normalizedQuery: "river",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows human-readable search results with project and phase context", () => {
    renderSearch();

    expect(screen.getByText("River Atlas")).toBeInTheDocument();
    expect(screen.getByText("Baseline Survey")).toBeInTheDocument();
    expect(screen.getByText("Validate Sensor Packet")).toBeInTheDocument();
    expect(screen.getAllByText("Project: River Atlas (PRJ-2026-001)").length).toBeGreaterThan(0);
    expect(screen.getByText(/Phase: Baseline Survey/)).toBeInTheDocument();
    expect(screen.queryByText(projectId)).not.toBeInTheDocument();
    expect(screen.queryByText(phaseId)).not.toBeInTheDocument();
    expect(screen.queryByText(taskId)).not.toBeInTheDocument();
  });

  it("links project, phase, and task results into the current project context", () => {
    renderSearch();

    expect(screen.getByRole("link", { name: "Open River Atlas" })).toHaveAttribute("href", `/projects/${projectId}`);
    expect(screen.getByRole("link", { name: "Open Baseline Survey" })).toHaveAttribute("href", `/projects/${projectId}?phase=${phaseId}`);
    expect(screen.getByRole("link", { name: "Open Validate Sensor Packet" })).toHaveAttribute(
      "href",
      `/projects/${projectId}?phase=${phaseId}&task=${taskId}`,
    );
  });
});

function renderSearch() {
  render(
    <MemoryRouter initialEntries={["/search?q=river"]}>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
