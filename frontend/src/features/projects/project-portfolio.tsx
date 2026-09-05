import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { ErrorState } from "@/components/common/error-state";
import { HealthBadge } from "@/components/common/health-badge";
import { PageTable } from "@/components/common/page-table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/features/auth/api";
import { userFacingErrorMessage } from "@/lib/api-errors";

import { useProjectDashboardQuery, useProjectsQuery } from "./hooks";
import type { ProjectSummary } from "./types";

export function ProjectPortfolio() {
  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data ?? [];

  if (projectsQuery.isError) {
    return <ErrorState title={errorTitle(projectsQuery.error)} message={errorMessage(projectsQuery.error)} />;
  }

  return (
    <div className="space-y-4">
      <PageTable
        isLoading={projectsQuery.isLoading}
        isEmpty={!projectsQuery.isLoading && projects.length === 0}
        emptyTitle="No projects available."
        emptyDescription="Accessible projects will appear here when the backend returns them."
      >
        <ProjectTable projects={projects} />
      </PageTable>
    </div>
  );
}

function ProjectTable({ projects }: { projects: ProjectSummary[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead scope="col">Project</TableHead>
          <TableHead scope="col">Health</TableHead>
          <TableHead scope="col">Progress</TableHead>
          <TableHead scope="col">Attention</TableHead>
          <TableHead scope="col" className="text-right">
            Open
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <ProjectRow key={project.id} project={project} />
        ))}
      </TableBody>
    </Table>
  );
}

function ProjectRow({ project }: { project: ProjectSummary }) {
  const dashboardQuery = useProjectDashboardQuery(project.id);
  const progress = dashboardQuery.data?.project.overall_progress;
  const activePhaseCount = dashboardQuery.data?.phases.filter((phase) => phase.status === "In Progress").length;
  const needsAttention = project.health === "At Risk" || project.health === "Delayed";

  return (
    <TableRow>
      <TableCell>
        <Link
          to={`/projects/${project.id}`}
          className="font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
        >
          {project.name}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {project.code}
          {typeof activePhaseCount === "number" ? ` / ${activePhaseCount} active phase${activePhaseCount === 1 ? "" : "s"}` : ""}
        </p>
      </TableCell>
      <TableCell>
        <HealthBadge value={project.health} />
      </TableCell>
      <TableCell className="min-w-44">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium text-foreground">{typeof progress === "number" ? `${Math.round(progress)}%` : "Loading"}</span>
        </div>
        <Progress value={typeof progress === "number" ? progress : 0} aria-label={`${project.name} progress`} className="mt-2" />
      </TableCell>
      <TableCell>
        {needsAttention ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Review
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/projects/${project.id}`} aria-label={`Open ${project.name}`}>
            Open
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </TableCell>
    </TableRow>
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
