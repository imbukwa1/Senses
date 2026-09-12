import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { HealthBadge } from "@/components/common/health-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import { useProjectDashboardQuery } from "./hooks";
import type { ProjectSummary } from "./types";

export function ProjectGridCard({ project }: { project: ProjectSummary }) {
  const dashboardQuery = useProjectDashboardQuery(project.id);
  const progress = dashboardQuery.data?.project.overall_progress;
  const activePhaseCount = dashboardQuery.data?.phases?.filter((phase) => phase.status === "In Progress").length;
  const needsAttention = project.health_label === "Needs attention" || project.health_label === "At risk";

  return (
    <Link to={`/projects/${project.id}`} className="rounded-md border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{project.code}</p>
        </div>
        <HealthBadge label={project.health_label} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge value={project.status} />
        <span className="text-xs text-muted-foreground">Lead: {project.project_lead.name}</span>
        {typeof activePhaseCount === "number" ? <span className="text-xs text-muted-foreground">{activePhaseCount} active phase{activePhaseCount === 1 ? "" : "s"}</span> : null}
        {needsAttention ? <span className="inline-flex items-center gap-1 text-xs font-medium text-warning"><AlertTriangle className="size-3" aria-hidden="true" />Review</span> : null}
      </div>
      {project.health_reasons[0] && project.health_label !== "On track" && project.health_label !== "Completed" ? <p className="mt-3 text-xs text-muted-foreground">{project.health_reasons[0]}</p> : null}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium text-foreground">{typeof progress === "number" ? `${Math.round(progress)}%` : "Loading"}</span>
        </div>
        <Progress value={typeof progress === "number" ? progress : 0} aria-label={`${project.name} progress`} />
      </div>
    </Link>
  );
}

export function ProjectListRow({ project }: { project: ProjectSummary }) {
  const dashboardQuery = useProjectDashboardQuery(project.id);
  const progress = dashboardQuery.data?.project.overall_progress;
  const activePhaseCount = dashboardQuery.data?.phases?.filter((phase) => phase.status === "In Progress").length;
  const needsAttention = project.health_label === "Needs attention" || project.health_label === "At risk";
  const healthReason = project.health_reasons[0];

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link to={`/projects/${project.id}`} className="font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
          {project.name}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          {project.code}
          {typeof activePhaseCount === "number" ? ` / ${activePhaseCount} active phase${activePhaseCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <HealthBadge label={project.health_label} />
        <span className="text-muted-foreground">{typeof progress === "number" ? `${Math.round(progress)}% progress` : "Progress loading"}</span>
        {needsAttention ? <span className="inline-flex items-center gap-1 font-medium text-warning"><AlertTriangle className="size-4" aria-hidden="true" />Review</span> : <span className="text-muted-foreground">No attention items</span>}
        {healthReason && project.health_label !== "On track" && project.health_label !== "Completed" ? <span className="sr-only">{healthReason}</span> : null}
        <Button asChild variant="ghost" size="sm">
          <Link to={`/projects/${project.id}`} aria-label={`Open ${project.name}`}>
            Open
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
