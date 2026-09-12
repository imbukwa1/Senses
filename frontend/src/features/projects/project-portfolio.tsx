import { ErrorState } from "@/components/common/error-state";
import { PageTable } from "@/components/common/page-table";
import { ApiError } from "@/features/auth/api";
import { userFacingErrorMessage } from "@/lib/api-errors";

import { useProjectsQuery } from "./hooks";
import { ProjectGridCard, ProjectListRow } from "./project-view-items";
import { ProjectViewToggle, useProjectView } from "./project-view-toggle";

export function ProjectPortfolio() {
  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data ?? [];
  const [view, setView] = useProjectView();

  if (projectsQuery.isError) {
    return <ErrorState title={errorTitle(projectsQuery.error)} message={errorMessage(projectsQuery.error)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ProjectViewToggle value={view} onChange={setView} />
      </div>
      <PageTable
        isLoading={projectsQuery.isLoading}
        isEmpty={!projectsQuery.isLoading && projects.length === 0}
        emptyTitle="No projects available."
        emptyDescription="Accessible projects will appear here when the backend returns them."
      >
        {view === "grid" ? <div className="grid gap-3 sm:grid-cols-2">{projects.map((project) => <ProjectGridCard key={project.id} project={project} />)}</div> : <div className="space-y-3">{projects.map((project) => <ProjectListRow key={project.id} project={project} />)}</div>}
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
