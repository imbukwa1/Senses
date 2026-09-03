import { CalendarDays, CheckCircle2, Clock, Edit, ListChecks, Users } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { HealthBadge } from "@/components/common/health-badge";
import { LoadingState } from "@/components/common/loading-state";
import { MetadataRow } from "@/components/common/metadata-row";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ApiError } from "@/features/auth/api";
import { userFacingErrorMessage } from "@/lib/api-errors";

import { useProjectDashboardQuery, useProjectQuery } from "./hooks";
import { PhaseManagementDialog } from "./phase-management-dialog";
import { PhaseTasks } from "./phase-tasks";
import { ProjectFormDialog } from "./project-form-dialog";
import { ProjectMembersDialog } from "./project-members-dialog";
import type { DashboardDeliverable, DashboardPhase, ProjectDashboard, UpcomingDeadline } from "./types";

export function ProjectDashboardPage() {
  const { projectId } = useParams();

  if (!projectId) {
    return <ErrorState title="Project not found" message="The project route is missing an ID." />;
  }

  return <ProjectDashboardContent projectId={projectId} />;
}

function ProjectDashboardContent({ projectId }: { projectId: string }) {
  const dashboardQuery = useProjectDashboardQuery(projectId);
  const projectQuery = useProjectQuery(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  if (dashboardQuery.isLoading) {
    return <LoadingState label="Loading project dashboard" />;
  }

  if (dashboardQuery.isError) {
    return <ErrorState title={dashboardErrorTitle(dashboardQuery.error)} message={dashboardErrorMessage(dashboardQuery.error)} />;
  }

  const dashboard = dashboardQuery.data;

  if (!dashboard) {
    return <ErrorState title="Dashboard unavailable" message="Project dashboard data could not be loaded." />;
  }

  const editProject = projectQuery.data;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono">
                {dashboard.project.code}
              </Badge>
              {dashboard.project.priority ? <StatusBadge value={dashboard.project.priority} /> : null}
            </div>
            <CardTitle className="mt-3 text-xl">{dashboard.project.name}</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">{dashboard.project.description}</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <ProjectFormDialog mode="edit" project={editProject} open={editOpen} onOpenChange={setEditOpen}>
              <Button type="button" variant="outline" disabled={projectQuery.isLoading || !editProject}>
                <Edit className="size-4" aria-hidden="true" />
                Edit Project
              </Button>
            </ProjectFormDialog>
            <ProjectMembersDialog project={projectForMembers(dashboard)} open={membersOpen} onOpenChange={setMembersOpen}>
              <Button type="button" variant="outline">
                <Users className="size-4" aria-hidden="true" />
                Members
              </Button>
            </ProjectMembersDialog>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 md:grid-cols-2">
            <MetadataRow label="Project Lead" value={`${dashboard.project.project_lead.name} (${dashboard.project.project_lead.email})`} />
            <MetadataRow label="Dates" value={`${formatDate(dashboard.project.start_date)} - ${formatDate(dashboard.project.end_date)}`} />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        <SummaryCard title="Status">
          <StatusBadge value={dashboard.project.status} />
        </SummaryCard>
        <SummaryCard title="Health">
          <HealthBadge value={dashboard.project.health} />
        </SummaryCard>
        <SummaryCard title="Overall Progress">
          <ProgressValue value={dashboard.project.overall_progress} label="Overall project progress" />
        </SummaryCard>
        <SummaryCard title="Current Phase">
          {dashboard.current_phase ? (
            <div>
              <p className="text-sm font-semibold text-foreground">{dashboard.current_phase.name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge value={dashboard.current_phase.status} />
                <Badge variant="outline">Current Phase</Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No current phase selected.</p>
          )}
        </SummaryCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.45fr)]">
        <PhasesSection projectId={projectId} phases={dashboard.phases} currentPhaseId={dashboard.project.current_phase_id} />
        <DeadlinesSection deadlines={dashboard.upcoming_deadlines} />
      </div>

      <DeliverablesSection deliverables={dashboard.deliverables} />
    </div>
  );
}

function SummaryCard({ children, title }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PhasesSection({ currentPhaseId, phases, projectId }: { projectId: string; phases: DashboardPhase[]; currentPhaseId: string | null }) {
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Phases</CardTitle>
          <CardDescription>Current Phase is a dashboard focus marker only.</CardDescription>
        </div>
        <PhaseManagementDialog projectId={projectId} phases={phases} currentPhaseId={currentPhaseId}>
          <Button type="button" variant="outline">
            <ListChecks className="size-4" aria-hidden="true" />
            Manage Phases
          </Button>
        </PhaseManagementDialog>
      </CardHeader>
      <CardContent>
        {phases.length === 0 ? (
          <EmptyState title="No phases have been added yet." />
        ) : (
          <div className="space-y-3">
            {phases.map((phase) => (
              <div key={phase.id} className="rounded-md border bg-background p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{phase.name}</h3>
                      <StatusBadge value={phase.status} />
                      {phase.id === currentPhaseId ? <Badge variant="outline">Current Phase</Badge> : null}
                    </div>
                    {phase.description ? <p className="mt-2 text-sm text-muted-foreground">{phase.description}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatOptionalDate(phase.start_date)} - {formatOptionalDate(phase.end_date)}
                    </p>
                  </div>
                  <div className="w-full sm:w-36">
                    <ProgressValue value={phase.progress} label={`${phase.name} progress`} compact />
                  </div>
                </div>
                <PhaseTasks projectId={projectId} phase={phase} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeadlinesSection({ deadlines }: { deadlines: UpcomingDeadline[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Deadlines</CardTitle>
        <CardDescription>Backend-provided project, phase, and task deadlines.</CardDescription>
      </CardHeader>
      <CardContent>
        {deadlines.length === 0 ? (
          <EmptyState title="No upcoming deadlines." />
        ) : (
          <div className="space-y-3">
            {deadlines.map((deadline) => (
              <div key={`${deadline.entity_type}-${deadline.entity_id}`} className="flex gap-3 rounded-md border bg-background p-3">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{deadline.name}</p>
                    <Badge variant="secondary">{formatEntityType(deadline.entity_type)}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(deadline.deadline_date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeliverablesSection({ deliverables }: { deliverables: DashboardDeliverable[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deliverables</CardTitle>
        <CardDescription>Checklist items attached to project tasks.</CardDescription>
      </CardHeader>
      <CardContent>
        {deliverables.length === 0 ? (
          <EmptyState title="No deliverables available." description="Task checklist items will appear here when they exist." />
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Deliverable
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Task
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Phase
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    State
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {deliverables.map((deliverable) => (
                  <tr key={deliverable.id}>
                    <td className="px-4 py-3 font-medium text-foreground">{deliverable.description}</td>
                    <td className="px-4 py-3 text-muted-foreground">{deliverable.task_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{deliverable.phase_name}</td>
                    <td className="px-4 py-3">
                      {deliverable.is_completed ? (
                        <Badge variant="success">
                          <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Clock className="mr-1 size-3" aria-hidden="true" />
                          Open
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressValue({ compact, label, value }: { value: number; label: string; compact?: boolean }) {
  const formattedValue = `${Math.round(value)}%`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className={compact ? "sr-only" : "text-sm text-muted-foreground"}>{label}</span>
        <span className="text-sm font-semibold text-foreground">{formattedValue}</span>
      </div>
      <Progress value={value} aria-label={`${label}: ${formattedValue}`} />
    </div>
  );
}

function projectForMembers(dashboard: ProjectDashboard) {
  return {
    id: dashboard.project.id,
    code: dashboard.project.code,
    name: dashboard.project.name,
    description: dashboard.project.description,
    project_lead_id: dashboard.project.project_lead.id,
    current_phase_id: dashboard.project.current_phase_id,
    start_date: dashboard.project.start_date,
    end_date: dashboard.project.end_date,
    status: dashboard.project.status,
    health: dashboard.project.health,
    health_color: dashboard.project.health_color,
    funder_partner: null,
    project_type: null,
    objectives: null,
    priority: dashboard.project.priority,
    created_at: dashboard.project.created_at,
    updated_at: dashboard.project.updated_at,
    archived_at: dashboard.project.archived_at,
  };
}

function dashboardErrorTitle(error: Error | null) {
  if (error instanceof ApiError && error.status === 403) {
    return "Project access denied";
  }
  if (error instanceof ApiError && error.status === 404) {
    return "Project not found";
  }

  return "Dashboard could not be loaded";
}

function dashboardErrorMessage(error: Error | null) {
  return userFacingErrorMessage(error, {
    forbidden: "You do not have access to this project.",
    notFound: "The requested project was not found.",
  });
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

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : "No date";
}

function formatEntityType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
