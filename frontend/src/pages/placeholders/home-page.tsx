import { AlertTriangle, ArrowRight, CalendarClock, FolderKanban } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ErrorState } from "@/components/common/error-state";
import { HealthBadge } from "@/components/common/health-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/features/auth/hooks";
import { useAttentionQuery, useMyWorkQuery, useProjectDashboardQuery, useProjectsQuery } from "@/features/projects/hooks";
import type { AttentionItem, MyWorkItem, ProjectSummary } from "@/features/projects/types";
import { userFacingErrorMessage } from "@/lib/api-errors";

const PROJECT_PREVIEW_LIMIT = 4;
const WORK_PREVIEW_LIMIT = 5;
const ATTENTION_PREVIEW_LIMIT = 3;

export function HomePage() {
  const { user } = useAuth();
  const projectsQuery = useProjectsQuery();
  const myWorkQuery = useMyWorkQuery();
  const attentionQuery = useAttentionQuery();

  const projects = projectsQuery.data ?? [];
  const myWork = myWorkQuery.data ?? [];
  const attention = attentionQuery.data ?? [];
  const overdueWork = myWork.filter((item) => item.overdue);
  const dueSoonWork = myWork.filter((item) => !item.overdue && isDueSoon(item.due_date));
  const activeWorkCount = myWork.filter((item) => item.status !== "Completed").length;

  if (projectsQuery.isError) {
    return <ErrorState title="Home could not be loaded" message={userFacingErrorMessage(projectsQuery.error)} />;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Hello, {user?.name ?? "there"}</p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">Home</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" variant="outline" size="sm">
            <Link to="/attention">
              <AlertTriangle className="size-4" aria-hidden="true" />
              Attention
            </Link>
          </Button>
          <Button asChild type="button" size="sm">
            <Link to="/my-work">
              <CalendarClock className="size-4" aria-hidden="true" />
              My Work
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard icon={FolderKanban} label="Projects" value={projects.length} linkLabel="Open projects" to="/projects" />
        <SummaryCard icon={CalendarClock} label="Active work" value={activeWorkCount} linkLabel="Open my work" to="/my-work" />
        <SummaryCard icon={AlertTriangle} label="Attention" value={attention.length} linkLabel="Review items" to="/attention" tone="warning" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-md border bg-surface p-5 shadow-soft" aria-labelledby="home-projects-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 id="home-projects-heading" className="text-base font-semibold text-foreground">
                Projects
              </h3>
              <p className="text-sm text-muted-foreground">Relevant project health and progress</p>
            </div>
            <Button asChild type="button" variant="ghost" size="sm">
              <Link to="/projects">
                View all
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {projectsQuery.isLoading ? (
              <EmptyPanel title="Loading projects" />
            ) : projects.length === 0 ? (
              <EmptyPanel title="No projects found" description="Projects appear here when you have access to them." />
            ) : (
              projects.slice(0, PROJECT_PREVIEW_LIMIT).map((project) => <ProjectHomeCard key={project.id} project={project} />)
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-md border bg-surface p-5 shadow-soft" aria-labelledby="home-work-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="home-work-heading" className="text-base font-semibold text-foreground">
                  My Work
                </h3>
                <p className="text-sm text-muted-foreground">
                  {overdueWork.length} overdue, {dueSoonWork.length} due soon
                </p>
              </div>
              <Button asChild type="button" variant="ghost" size="sm">
                <Link to="/my-work">Open</Link>
              </Button>
            </div>

            <PreviewList
              isLoading={myWorkQuery.isLoading}
              items={myWork.slice(0, WORK_PREVIEW_LIMIT)}
              emptyTitle="No assigned work"
              renderItem={(item) => <WorkPreview key={item.task_id} item={item} />}
            />
          </section>

          <section className="rounded-md border bg-surface p-5 shadow-soft" aria-labelledby="home-attention-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="home-attention-heading" className="text-base font-semibold text-foreground">
                  Attention
                </h3>
                <p className="text-sm text-muted-foreground">A quick look at work needing review</p>
              </div>
              <Button asChild type="button" variant="ghost" size="sm">
                <Link to="/attention">Open</Link>
              </Button>
            </div>

            {attentionQuery.isError ? (
              <p className="mt-4 text-sm text-error">{userFacingErrorMessage(attentionQuery.error)}</p>
            ) : (
              <PreviewList
                isLoading={attentionQuery.isLoading}
                items={attention.slice(0, ATTENTION_PREVIEW_LIMIT)}
                emptyTitle="Nothing needs attention"
                renderItem={(item) => <AttentionPreview key={`${item.type}-${item.task_id ?? item.phase_id ?? item.project_id}`} item={item} />}
              />
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  linkLabel,
  to,
  tone = "default",
  value,
}: {
  icon: typeof FolderKanban;
  label: string;
  linkLabel: string;
  to: string;
  tone?: "default" | "warning";
  value: number;
}) {
  return (
    <section className="rounded-md border bg-surface p-4 shadow-soft" aria-label={`${label} summary`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-md border bg-background">
          <Icon className={tone === "warning" ? "size-5 text-warning" : "size-5 text-primary"} aria-hidden="true" />
        </div>
      </div>
      <Button asChild type="button" variant="ghost" size="sm" className="mt-3 px-0">
        <Link to={to}>
          {linkLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}

function ProjectHomeCard({ project }: { project: ProjectSummary }) {
  const dashboardQuery = useProjectDashboardQuery(project.id);
  const progress = dashboardQuery.data?.project.overall_progress;

  return (
    <Link
      to={`/projects/${project.id}`}
      className="rounded-md border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
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
      </div>
      {project.health_reasons[0] && project.health_label !== "On track" && project.health_label !== "Completed" ? (
        <p className="mt-3 text-xs text-muted-foreground">{project.health_reasons[0]}</p>
      ) : null}
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

function PreviewList<T>({
  emptyTitle,
  isLoading,
  items,
  renderItem,
}: {
  emptyTitle: string;
  isLoading: boolean;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  if (isLoading) {
    return <p className="mt-4 text-sm text-muted-foreground">Loading</p>;
  }

  if (items.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">{emptyTitle}</p>;
  }

  return <div className="mt-4 space-y-3">{items.map(renderItem)}</div>;
}

function WorkPreview({ item }: { item: MyWorkItem }) {
  return (
    <Link to={`/projects/${item.project_id}?phase=${item.phase_id}&task=${item.task_id}`} className="block rounded-md border bg-background p-3 hover:bg-accent/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{item.task_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.project_name} / {item.phase_name}
          </p>
        </div>
        {item.overdue ? <Badge variant="error">Overdue</Badge> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge value={item.status} />
        <span className="text-xs text-muted-foreground">Due {formatOptionalDate(item.due_date)}</span>
      </div>
    </Link>
  );
}

function AttentionPreview({ item }: { item: AttentionItem }) {
  return (
    <Link to={attentionHref(item)} className="block rounded-md border bg-background p-3 hover:bg-accent/40">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{item.reason}</p>
        <Badge variant={item.severity === "Needs attention" ? "error" : "warning"}>{item.severity}</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {item.project_name}
        {item.phase_name ? ` / ${item.phase_name}` : ""}
      </p>
    </Link>
  );
}

function EmptyPanel({ description, title }: { title: string; description?: string }) {
  return (
    <div className="rounded-md border bg-background p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function attentionHref(item: AttentionItem) {
  const params = new URLSearchParams();
  if (item.phase_id) {
    params.set("phase", item.phase_id);
  }
  if (item.task_id) {
    params.set("task", item.task_id);
  }

  const query = params.toString();
  return `/projects/${item.project_id}${query ? `?${query}` : ""}`;
}

function isDueSoon(value: string | null) {
  if (!value) {
    return false;
  }

  const dueDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (Number.isNaN(dueDate.getTime()) || dueDate < today) {
    return false;
  }

  const diffMs = dueDate.getTime() - today.getTime();
  return diffMs <= 7 * 24 * 60 * 60 * 1000;
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "No due date";
  }

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
