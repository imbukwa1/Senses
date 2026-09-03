import { Archive, ArrowUpRight, Edit, Users } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ConfirmAction } from "@/components/common/confirm-action";
import { ErrorState, InlineErrorMessage } from "@/components/common/error-state";
import { HealthBadge } from "@/components/common/health-badge";
import { PageTable } from "@/components/common/page-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/features/auth/api";
import { userFacingErrorMessage } from "@/lib/api-errors";

import { useArchiveProjectMutation, useProjectsQuery } from "./hooks";
import { ProjectFormDialog } from "./project-form-dialog";
import { ProjectMembersDialog } from "./project-members-dialog";
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
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [membersProjectId, setMembersProjectId] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead scope="col">Code</TableHead>
          <TableHead scope="col">Project Name</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col">Health</TableHead>
          <TableHead scope="col">End Date</TableHead>
          <TableHead scope="col">Priority</TableHead>
          <TableHead scope="col" className="text-right">
            Action
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((project) => (
          <TableRow key={project.id}>
            <TableCell className="whitespace-nowrap font-mono text-xs font-medium text-foreground">{project.code}</TableCell>
            <TableCell>
              <Link
                to={`/projects/${project.id}`}
                className="font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
              >
                {project.name}
              </Link>
              {project.project_type ? <p className="mt-1 text-xs text-muted-foreground">{project.project_type}</p> : null}
            </TableCell>
            <TableCell>
              <StatusBadge value={project.status} />
            </TableCell>
            <TableCell>
              <HealthBadge value={project.health} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(project.end_date)}</TableCell>
            <TableCell>{project.priority ? <StatusBadge value={project.priority} /> : <span className="text-muted-foreground">-</span>}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <ProjectFormDialog
                  mode="edit"
                  project={project}
                  open={editingProjectId === project.id}
                  onOpenChange={(open) => setEditingProjectId(open ? project.id : null)}
                >
                  <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${project.name}`}>
                    <Edit className="size-4" aria-hidden="true" />
                    Edit
                  </Button>
                </ProjectFormDialog>
                <ProjectMembersDialog
                  project={project}
                  open={membersProjectId === project.id}
                  onOpenChange={(open) => setMembersProjectId(open ? project.id : null)}
                >
                  <Button type="button" variant="ghost" size="sm" aria-label={`Manage members for ${project.name}`}>
                    <Users className="size-4" aria-hidden="true" />
                    Members
                  </Button>
                </ProjectMembersDialog>
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/projects/${project.id}`} aria-label={`Open ${project.name}`}>
                    Open
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <ArchiveProjectAction project={project} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ArchiveProjectAction({ project }: { project: ProjectSummary }) {
  const archiveProject = useArchiveProjectMutation(project.id);

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <ConfirmAction
        title="Archive project?"
        description="This uses the backend's history-preserving archive behaviour. It does not hard-delete the project."
        confirmLabel="Archive Project"
        onConfirm={() => archiveProject.mutate()}
      >
        <Button type="button" variant="ghost" size="sm" disabled={archiveProject.isPending} aria-label={`Archive ${project.name}`}>
          <Archive className="size-4" aria-hidden="true" />
          {archiveProject.isPending ? "Archiving..." : "Archive"}
        </Button>
      </ConfirmAction>
      {archiveProject.error ? (
        <InlineErrorMessage
          message={userFacingErrorMessage(archiveProject.error, {
            forbidden: "You do not have access to archive this project.",
            notFound: "The project could not be found.",
          })}
        />
      ) : null}
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
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
