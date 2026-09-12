import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/error-state";
import { PageTable } from "@/components/common/page-table";
import { ApiError } from "@/features/auth/api";
import { userFacingErrorMessage } from "@/lib/api-errors";

import { useAllProjectsQuery, useProjectsQuery } from "./hooks";
import { ProjectGridCard, ProjectListRow, ProjectOverviewGridCard, ProjectOverviewListRow } from "./project-view-items";
import { ProjectViewToggle, useProjectView } from "./project-view-toggle";

type ProjectTab = "mine" | "all";

export function ProjectPortfolio() {
  const projectsQuery = useProjectsQuery();
  const [view, setView] = useProjectView();
  const [tab, setTab] = useState<ProjectTab>("mine");
  const allProjectsQuery = useAllProjectsQuery(tab === "all");
  const activeQuery = tab === "all" ? allProjectsQuery : projectsQuery;
  const projects = activeQuery.data ?? [];

  if (activeQuery.isError) {
    return <ErrorState title={errorTitle(activeQuery.error)} message={errorMessage(activeQuery.error)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-md border bg-background p-1" role="tablist" aria-label="Project scope">
          <Button type="button" size="sm" variant={tab === "mine" ? "default" : "ghost"} role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}>My Projects</Button>
          <Button type="button" size="sm" variant={tab === "all" ? "default" : "ghost"} role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")}>All Projects</Button>
        </div>
        <ProjectViewToggle value={view} onChange={setView} />
      </div>
      <PageTable
        isLoading={activeQuery.isLoading}
        isEmpty={!activeQuery.isLoading && projects.length === 0}
        emptyTitle="No projects available."
        emptyDescription="Accessible projects will appear here when the backend returns them."
      >
        {tab === "all" ? (view === "grid" ? <div className="grid gap-3 sm:grid-cols-2">{projects.map((project) => <ProjectOverviewGridCard key={project.id} project={project} />)}</div> : <div className="space-y-3">{projects.map((project) => <ProjectOverviewListRow key={project.id} project={project} />)}</div>) : view === "grid" ? <div className="grid gap-3 sm:grid-cols-2">{projects.map((project) => <ProjectGridCard key={project.id} project={project} />)}</div> : <div className="space-y-3">{projects.map((project) => <ProjectListRow key={project.id} project={project} />)}</div>}
      </PageTable>
    </div>
  );
}

function errorTitle(error: Error | null) {
  if (error instanceof ApiError && error.status === 403) {
    return "Access denied";
  }

  return "Projects could not be loaded";
}

function errorMessage(error: Error | null) {
  return userFacingErrorMessage(error, {
    forbidden: "You do not have access to these projects.",
  });
}
