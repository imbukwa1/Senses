import { AlertTriangle, Archive, CalendarDays, CheckCircle2, Clock, DollarSign, Download, Edit, FileText, ListChecks, Save, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ConfirmAction } from "@/components/common/confirm-action";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { HealthBadge } from "@/components/common/health-badge";
import { LoadingState } from "@/components/common/loading-state";
import { MetadataRow } from "@/components/common/metadata-row";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";
import { UserSearchSelect } from "@/features/users/user-search-select";
import { userFacingErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

import { FilePreviewDialog } from "./file-preview-dialog";
import {
  useAddPhaseMemberMutation,
  useArchiveProjectMutation,
  useAttentionQuery,
  useDownloadProjectFileMutation,
  usePhaseMembersQuery,
  useProjectBudgetQuery,
  useProjectDashboardQuery,
  useProjectFilesQuery,
  useProjectMembersQuery,
  useProjectOverviewQuery,
  useProjectQuery,
  useRemovePhaseMemberMutation,
  useTasksQuery,
  useUpdatePhaseBudgetMutation,
  useUpdateProjectBudgetMutation,
  useUploadTaskFileMutation,
} from "./hooks";
import { PhaseManagementDialog } from "./phase-management-dialog";
import { PhaseTasks } from "./phase-tasks";
import { ProjectFormDialog } from "./project-form-dialog";
import { ProjectMembersDialog } from "./project-members-dialog";
import { ProjectSetupCard, ProjectSetupPanel } from "./project-setup";
import { ProjectWorkspace } from "./project-workspace";
import { ProjectOverviewPage } from "./project-overview";
import type { AttentionItem, DashboardDeliverable, DashboardPhase, PhaseMember, ProjectBudget, ProjectDashboard, ProjectFile, ProjectMember, UpcomingDeadline } from "./types";

export function ProjectDashboardPage() {
  const { projectId } = useParams();

  if (!projectId) {
    return <ErrorState title="Project not found" message="The project route is missing an ID." />;
  }

  return <ProjectDashboardGate projectId={projectId} />;
}

function ProjectDashboardGate({ projectId }: { projectId: string }) {
  const [searchParams] = useSearchParams();
  const dashboardQuery = useProjectDashboardQuery(projectId);
  const fromAllProjects = searchParams.get("source") === "all-projects";
  const overviewQuery = useProjectOverviewQuery(projectId, fromAllProjects && dashboardQuery.isError);

  if (dashboardQuery.isLoading) {
    return <LoadingState label="Loading project dashboard" />;
  }

  if (dashboardQuery.isError) {
    if (fromAllProjects && (dashboardQuery.error instanceof ApiError && [403, 404].includes(dashboardQuery.error.status))) {
      if (overviewQuery.isLoading) {
        return <LoadingState label="Loading project overview" />;
      }
      if (overviewQuery.isError || !overviewQuery.data) {
        return <ErrorState title={dashboardErrorTitle(overviewQuery.error)} message={dashboardErrorMessage(overviewQuery.error)} />;
      }
      return <ProjectOverviewPage project={overviewQuery.data} />;
    }
    return <ErrorState title={dashboardErrorTitle(dashboardQuery.error)} message={dashboardErrorMessage(dashboardQuery.error)} />;
  }

  if (!dashboardQuery.data) {
    return <ErrorState title="Dashboard unavailable" message="Project dashboard data could not be loaded." />;
  }

  return <ProjectDashboardContent projectId={projectId} dashboard={dashboardQuery.data} />;
}

function ProjectDashboardContent({ projectId, dashboard }: { projectId: string; dashboard: ProjectDashboard }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const projectQuery = useProjectQuery(projectId);
  const projectMembersQuery = useProjectMembersQuery(projectId, true);
  const attentionQuery = useAttentionQuery();
  const archiveProject = useArchiveProjectMutation(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const initialTab = searchParams.get("tab") === "setup" ? "setup" : "overview";
  const [activeProjectTab, setActiveProjectTab] = useState<"overview" | "setup" | "workspace">(initialTab);

  const editProject = projectQuery.data;
  const projectMembers = projectMembersQuery.data ?? [];
  const currentMember = projectMembers.find((member) => member.user_id === user?.id);
  const isProjectPm = currentMember?.role === "PM";
  const canViewFinance = currentMember?.role === "PM" || currentMember?.role === "Finance";
  const canEditFinance = currentMember?.role === "Finance";
  const projectAttention = (attentionQuery.data ?? []).filter((item) => item.project_id === projectId);
  const roleBadgeLabel = currentMember?.role ?? "Project Member";
  const activePhases = dashboard.phases.filter((phase) => phase.status === "In Progress");
  const phaseSectionTitle = isProjectPm ? "Active Phases" : "Your Work";
  const phaseSectionDescription = isProjectPm
    ? "Phase activity, task status, and people assigned in this project."
    : "Relevant phases, assigned work, dates, files, and comments are available from each task.";
  const summaryCards = (
    <div className="grid gap-4 lg:grid-cols-4">
      <SummaryCard management={isProjectPm} title="Status">
        <StatusBadge value={dashboard.project.status} />
      </SummaryCard>
      <SummaryCard management={isProjectPm} title="Health">
        <div className="space-y-2">
          <HealthBadge label={dashboard.project.health_label} />
          {dashboard.project.health_reasons.length > 0 ? (
            <p className="text-sm text-muted-foreground">{dashboard.project.health_reasons[0]}</p>
          ) : null}
        </div>
      </SummaryCard>
      <SummaryCard management={isProjectPm} title="Overall Progress">
        <ProgressValue value={dashboard.project.overall_progress} label="Overall project progress" />
      </SummaryCard>
      <SummaryCard management={isProjectPm} title="Attention">
        <div className="flex items-center gap-2">
          <AlertTriangle className={projectAttention.length > 0 ? "size-4 text-brand-red" : "size-4 text-muted-foreground"} aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">
            {projectAttention.length} item{projectAttention.length === 1 ? "" : "s"}
          </span>
        </div>
      </SummaryCard>
    </div>
  );
  const phasesAndDeadlines = (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.45fr)]">
      <PhasesSection
        currentPhaseId={dashboard.project.current_phase_id}
        description={phaseSectionDescription}
        isProjectPm={isProjectPm}
        phases={dashboard.phases}
        projectMembers={projectMembers}
        projectId={projectId}
        title={phaseSectionTitle}
      />
      <DeadlinesSection deadlines={dashboard.upcoming_deadlines} />
    </div>
  );

  return (
    <div className={cn("space-y-5", isProjectPm && "rounded-md border border-neutral-900/10 bg-neutral-950/5 p-3 sm:p-4")}>
      <Card className={cn(isProjectPm && "overflow-hidden border-neutral-900 bg-neutral-950 text-white shadow-none")}>
        {isProjectPm ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-neutral-900 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-transparent bg-brand-red text-white">PM</Badge>
              <span className="text-sm font-medium text-white/80">Management Workspace</span>
            </div>
            <span className="text-xs text-white/60">{activePhases.length} active phase{activePhases.length === 1 ? "" : "s"}</span>
          </div>
        ) : null}
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("font-mono", isProjectPm && "border-white/20 text-white")}>
                {dashboard.project.code}
              </Badge>
              {!isProjectPm ? <Badge variant="secondary">{roleBadgeLabel}</Badge> : null}
              {dashboard.project.priority ? <StatusBadge value={dashboard.project.priority} /> : null}
            </div>
            <CardTitle className={cn("mt-3 text-xl", isProjectPm && "text-white")}>{dashboard.project.name}</CardTitle>
            <CardDescription className={cn("mt-2 max-w-3xl", isProjectPm && "text-white/70")}>{dashboard.project.description}</CardDescription>
          </div>
          {isProjectPm ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <ProjectFormDialog mode="edit" project={editProject} open={editOpen} onOpenChange={setEditOpen}>
                <Button type="button" size="sm" className="bg-brand-red text-white hover:bg-brand-red/90" disabled={projectQuery.isLoading || !editProject}>
                  <Edit className="size-4" aria-hidden="true" />
                  Edit
                </Button>
              </ProjectFormDialog>
              <ProjectMembersDialog project={projectForMembers(dashboard)} open={membersOpen} onOpenChange={setMembersOpen}>
                <Button type="button" variant="outline" size="sm" className="border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white">
                  <Users className="size-4" aria-hidden="true" />
                  People
                </Button>
              </ProjectMembersDialog>
              <ConfirmAction
                title="Archive project?"
                description="This keeps project history and removes the project from active work."
                confirmLabel="Archive Project"
                onConfirm={async () => {
                  try {
                    await archiveProject.mutateAsync();
                    navigate("/projects");
                  } catch {
                    return;
                  }
                }}
              >
                <Button type="button" variant="ghost" size="sm" className="text-white/80 hover:bg-white/10 hover:text-white" disabled={archiveProject.isPending}>
                  <Archive className="size-4" aria-hidden="true" />
                  {archiveProject.isPending ? "Archiving..." : "Archive"}
                </Button>
              </ConfirmAction>
            </div>
          ) : null}
        </CardHeader>
        {archiveProject.error ? (
          <CardContent className="pt-0">
            <ErrorState title="Project could not be archived" message={dashboardErrorMessage(archiveProject.error)} />
          </CardContent>
        ) : null}
        <CardContent>
          <ProjectMetaRows
            management={isProjectPm}
            lead={`${dashboard.project.project_lead.name} (${dashboard.project.project_lead.email})`}
            dates={`${formatDate(dashboard.project.start_date)} - ${formatDate(dashboard.project.end_date)}`}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 border-b">
        <Button
          type="button"
          variant="ghost"
          className={projectTabClass(activeProjectTab === "overview", isProjectPm)}
          onClick={() => setActiveProjectTab("overview")}
        >
          Overview
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={projectTabClass(activeProjectTab === "workspace", isProjectPm)}
          onClick={() => setActiveProjectTab("workspace")}
        >
          Workspace
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={projectTabClass(activeProjectTab === "setup", isProjectPm)}
          onClick={() => setActiveProjectTab("setup")}
        >
          Project Setup
        </Button>
      </div>

      {activeProjectTab === "overview" ? (
        <>
          {dashboard.setup ? <ProjectSetupCard setup={dashboard.setup} onContinue={() => setActiveProjectTab("setup")} /> : null}

          {summaryCards}

          {isProjectPm ? <AttentionItemsSection items={projectAttention} /> : null}

          {isProjectPm ? phasesAndDeadlines : null}

          {canViewFinance ? <ProjectFinanceSection canEdit={canEditFinance} phases={dashboard.phases} projectId={projectId} /> : null}

          {!isProjectPm ? phasesAndDeadlines : null}

          <ProjectChecklistSection deliverables={dashboard.deliverables} />

          <ProjectFilesSection projectId={projectId} />

          {editProject?.objectives ? (
            <Card>
              <CardHeader>
                <CardTitle>Objectives</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{editProject.objectives}</p>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : activeProjectTab === "workspace" ? (
        <ProjectWorkspace canCreateFolder={Boolean(currentMember)} canManage={isProjectPm} projectId={projectId} phases={dashboard.phases} />
      ) : (
        <ProjectSetupPanel canEdit={isProjectPm} dashboard={dashboard} projectId={projectId} />
      )}
    </div>
  );
}

function projectTabClass(active: boolean, management: boolean) {
  return cn(
    "h-10 rounded-none border-b-2 border-transparent px-3",
    active && "border-primary text-primary hover:text-primary",
    active && management && "border-brand-red text-brand-red hover:text-brand-red",
  );
}

function ProjectMetaRows({ dates, lead, management }: { dates: string; lead: string; management: boolean }) {
  if (!management) {
    return (
      <dl className="grid gap-x-8 md:grid-cols-2">
        <MetadataRow label="Project Lead" value={lead} />
        <MetadataRow label="Dates" value={dates} />
      </dl>
    );
  }

  return (
    <dl className="grid gap-x-8 md:grid-cols-2">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 py-3">
        <dt className="text-sm text-white/60">Project Lead</dt>
        <dd className="text-right text-sm font-medium text-white">{lead}</dd>
      </div>
      <div className="flex items-start justify-between gap-4 border-b border-white/10 py-3 last:border-b-0">
        <dt className="text-sm text-white/60">Dates</dt>
        <dd className="text-right text-sm font-medium text-white">{dates}</dd>
      </div>
    </dl>
  );
}

function SummaryCard({ children, management = false, title }: { title: string; children: React.ReactNode; management?: boolean }) {
  return (
    <Card className={cn(management && "border-brand-red/25 shadow-none ring-1 ring-brand-red/10")}>
      <CardHeader className="pb-3">
        <CardDescription className={cn(management && "font-medium text-brand-red")}>{title}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function AttentionItemsSection({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="border-brand-red/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-brand-red" aria-hidden="true" />
          Attention Items
        </CardTitle>
        <CardDescription>Open project risks and overdue work that need management attention.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title="No attention items." />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={`${item.type}-${item.phase_id ?? "project"}-${item.task_id ?? item.project_id}-${item.reason}`} className="rounded-md border border-brand-red/15 bg-brand-red/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-transparent bg-brand-red text-white">{item.severity}</Badge>
                  <Badge variant="outline">{formatEntityType(item.type)}</Badge>
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{item.task_name ?? item.phase_name ?? item.project_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                {item.assigned_person || item.due_date ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {item.assigned_person ? item.assigned_person.name : "Unassigned"}
                    {item.due_date ? ` / Due ${formatDate(item.due_date)}` : ""}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectFinanceSection({ canEdit, phases, projectId }: { canEdit: boolean; phases: DashboardPhase[]; projectId: string }) {
  return (
    <div className="space-y-4">
      <BudgetSection canEdit={canEdit} projectId={projectId} />
      <PhaseBudgetsSection canEdit={canEdit} phases={phases} projectId={projectId} />
      <FinanceDocumentsSection canEdit={canEdit} phases={phases} projectId={projectId} />
    </div>
  );
}

function BudgetSection({ canEdit, projectId }: { canEdit: boolean; projectId: string }) {
  const budgetQuery = useProjectBudgetQuery(projectId);
  const updateBudget = useUpdateProjectBudgetMutation(projectId);
  const [allocated, setAllocated] = useState("");

  useEffect(() => {
    if (budgetQuery.data) {
      setAllocated(String(budgetQuery.data.allocated));
    }
  }, [budgetQuery.data]);

  async function onSave() {
    await updateBudget.mutateAsync({
      allocated: Number(allocated),
    });
  }

  if (budgetQuery.isLoading) {
    return <LoadingState label="Loading project budget" />;
  }

  if (budgetQuery.isError) {
    return <ErrorState title="Budget could not be loaded" message={dashboardErrorMessage(budgetQuery.error)} />;
  }

  if (!budgetQuery.data) {
    return null;
  }

  const hasInvalidValues = !isNonNegativeNumber(allocated);

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="size-5 text-success" aria-hidden="true" />
            Project Budget
          </CardTitle>
          <CardDescription>Project allocated budget with phase spending totals.</CardDescription>
        </div>
        {canEdit ? <Button type="button" variant="outline" disabled={hasInvalidValues || updateBudget.isPending} onClick={onSave}>
          <Save className="size-4" aria-hidden="true" />
          {updateBudget.isPending ? "Saving..." : "Save Budget"}
        </Button> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <BudgetMetric label="Allocated" value={formatCurrency(budgetQuery.data.allocated)} />
          <BudgetMetric label="Spent" value={formatCurrency(budgetQuery.data.spent)} />
          <BudgetMetric label="Remaining" value={formatCurrency(budgetQuery.data.remaining)} tone={budgetQuery.data.remaining < 0 ? "error" : "default"} />
          <BudgetMetric label="Utilisation" value={formatPercent(budgetQuery.data.utilisation)} />
        </div>
        {canEdit ? <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="budget-allocated">Allocated</Label>
            <Input
              id="budget-allocated"
              type="number"
              min="0"
              step="0.01"
              value={allocated}
              onChange={(event) => setAllocated(event.target.value)}
            />
          </div>
        </div> : null}
        {hasInvalidValues ? <p className="text-sm text-error">Budget values must be non-negative numbers.</p> : null}
        {updateBudget.error ? <p className="text-sm text-error">{dashboardErrorMessage(updateBudget.error)}</p> : null}
      </CardContent>
    </Card>
  );
}

function BudgetMetric({ label, tone = "default", value }: { label: string; value: string; tone?: "default" | "error" }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={tone === "error" ? "mt-1 text-lg font-semibold text-error" : "mt-1 text-lg font-semibold text-foreground"}>{value}</p>
    </div>
  );
}

function PhaseBudgetsSection({ canEdit, phases, projectId }: { canEdit: boolean; phases: DashboardPhase[]; projectId: string }) {
  const budgetQuery = useProjectBudgetQuery(projectId);
  const updatePhaseBudget = useUpdatePhaseBudgetMutation(projectId);
  const [drafts, setDrafts] = useState<Record<string, { allocated: string; spent: string }>>({});
  const phaseBudgetRows = phases.map((phase) => ({
    ...phase,
    draft: drafts[phase.id] ?? {
      allocated: String(phase.budget_allocated),
      spent: String(phase.budget_spent),
    },
  }));

  function setDraft(phaseId: string, field: "allocated" | "spent", value: string) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [phaseId]: {
        allocated: currentDrafts[phaseId]?.allocated ?? String(phases.find((phase) => phase.id === phaseId)?.budget_allocated ?? 0),
        spent: currentDrafts[phaseId]?.spent ?? String(phases.find((phase) => phase.id === phaseId)?.budget_spent ?? 0),
        [field]: value,
      },
    }));
  }

  async function savePhaseBudget(phaseId: string) {
    const draft = drafts[phaseId];
    if (!draft) {
      return;
    }
    await updatePhaseBudget.mutateAsync({
      phaseId,
      payload: {
        allocated: Number(draft.allocated),
        spent: Number(draft.spent),
      },
    });
    setDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[phaseId];
      return nextDrafts;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phase Budgets</CardTitle>
        <CardDescription>Allocated and spent values by phase.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Phase</th>
                <th className="px-3 py-2 font-medium">Allocated</th>
                <th className="px-3 py-2 font-medium">Spent</th>
                <th className="px-3 py-2 font-medium">Remaining</th>
                <th className="px-3 py-2 font-medium">Utilisation</th>
                {canEdit ? <th className="py-2 pl-3 text-right font-medium">Save</th> : null}
              </tr>
            </thead>
            <tbody>
              {phaseBudgetRows.map((phase) => {
                const invalid = !isNonNegativeNumber(phase.draft.allocated) || !isNonNegativeNumber(phase.draft.spent);
                return (
                  <tr key={phase.id} className="border-b last:border-b-0">
                    <td className="py-3 pr-3 font-medium text-foreground">{phase.name}</td>
                    <td className="px-3 py-3">
                      {canEdit ? (
                        <Input type="number" min="0" step="0.01" value={phase.draft.allocated} onChange={(event) => setDraft(phase.id, "allocated", event.target.value)} aria-label={`${phase.name} allocated`} />
                      ) : (
                        formatCurrency(phase.budget_allocated)
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {canEdit ? (
                        <Input type="number" min="0" step="0.01" value={phase.draft.spent} onChange={(event) => setDraft(phase.id, "spent", event.target.value)} aria-label={`${phase.name} spent`} />
                      ) : (
                        formatCurrency(phase.budget_spent)
                      )}
                    </td>
                    <td className={phase.budget_remaining < 0 ? "px-3 py-3 text-error" : "px-3 py-3"}>{formatCurrency(phase.budget_remaining)}</td>
                    <td className="px-3 py-3">{formatPercent(phase.budget_utilisation)}</td>
                    {canEdit ? (
                      <td className="py-3 pl-3 text-right">
                        <Button type="button" variant="outline" size="sm" disabled={invalid || updatePhaseBudget.isPending || !drafts[phase.id]} onClick={() => savePhaseBudget(phase.id)}>
                          <Save className="size-4" aria-hidden="true" />
                          Save
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {updatePhaseBudget.error ? <p className="mt-3 text-sm text-error">{dashboardErrorMessage(updatePhaseBudget.error)}</p> : null}
        </div>
        <PhaseBudgetPie budget={budgetQuery.data ?? null} isLoading={budgetQuery.isLoading} phases={phases} />
      </CardContent>
    </Card>
  );
}

function PhaseBudgetPie({ budget, isLoading, phases }: { budget: ProjectBudget | null; isLoading: boolean; phases: DashboardPhase[] }) {
  const allocated = budget?.allocated ?? 0;
  const totalSpent = phases.reduce((sum, phase) => sum + phase.budget_spent, 0);
  const unutilized = Math.max(allocated - totalSpent, 0);
  const colors = ["#2c5aa0", "#3d8a43", "#7c3aed", "#ca8a04", "#0891b2", "#0f766e"];
  const segments = buildPieSegments(phases, allocated, totalSpent);
  const donutBackground = buildDonutBackground(segments);

  return (
    <div className="p-2">
      <p className="text-sm font-semibold text-foreground">Total Project Utilisation</p>
      {isLoading ? <LoadingState label="Loading project utilisation" /> : null}
      {!isLoading && allocated > 0 ? (
        <div
          className="relative mx-auto mt-4 size-52 rounded-full"
          role="img"
          aria-label="Total project utilisation by phase"
          style={{ background: donutBackground }}
        >
          <div className="absolute inset-14 rounded-full bg-background" />
        </div>
      ) : (
        !isLoading ? <div className="mt-4 flex aspect-square items-center justify-center rounded-full border text-sm text-muted-foreground">No budget allocated</div> : null
      )}
      <div className="mt-4 space-y-2">
        {phases.filter((phase) => phase.budget_spent > 0).map((phase, index) => (
          <div key={phase.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              <span className="truncate text-muted-foreground">{phase.name} spent</span>
            </span>
            <span className="font-medium text-foreground">{allocated > 0 ? formatPercent(phase.budget_spent / allocated) : "0%"}</span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-slate-300" />
            <span className="truncate text-muted-foreground">Unutilized</span>
          </span>
          <span className="font-medium text-foreground">{allocated > 0 ? formatPercent(unutilized / allocated) : "0%"}</span>
        </div>
      </div>
    </div>
  );
}

function FinanceDocumentsSection({ canEdit, phases, projectId }: { canEdit: boolean; phases: DashboardPhase[]; projectId: string }) {
  const filesQuery = useProjectFilesQuery(projectId);
  const financeFiles = (filesQuery.data ?? []).filter((file) => file.file_category === "finance");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finance Documents</CardTitle>
        <CardDescription>Budget sheets, quotations, finance reports, and supporting spreadsheets.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit ? <FinanceDocumentUpload projectId={projectId} phases={phases} /> : null}
        {filesQuery.isLoading ? <LoadingState label="Loading finance documents" /> : null}
        {filesQuery.isError ? <ErrorState title="Finance documents could not be loaded" message={dashboardErrorMessage(filesQuery.error)} /> : null}
        {!filesQuery.isLoading && !filesQuery.isError && financeFiles.length === 0 ? <EmptyState title="No finance documents uploaded yet." /> : null}
        {!filesQuery.isLoading && !filesQuery.isError && financeFiles.length > 0 ? (
          <div className="divide-y rounded-md border bg-surface">
            {financeFiles.map((file) => (
              <ProjectFileRow key={file.id} file={file} projectId={projectId} />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FinanceDocumentUpload({ phases, projectId }: { phases: DashboardPhase[]; projectId: string }) {
  const [selectedPhaseId, setSelectedPhaseId] = useState(phases[0]?.id ?? "");
  const selectedPhase = phases.find((phase) => phase.id === selectedPhaseId);
  const tasksQuery = useTasksQuery(projectId, selectedPhaseId, Boolean(selectedPhaseId));
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [fileInputKey, setFileInputKey] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const uploadFile = useUploadTaskFileMutation(projectId, selectedPhaseId, selectedTaskId);

  useEffect(() => {
    if (tasks.length > 0 && !tasks.some((task) => task.id === selectedTaskId)) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, tasks]);

  function onSelectFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    setSelectedFiles((currentFiles) => [...currentFiles, ...Array.from(files)]);
    setFileInputKey((key) => key + 1);
  }

  async function onUpload() {
    for (const file of selectedFiles) {
      await uploadFile.mutateAsync({ file, fileCategory: "finance" });
    }
    setSelectedFiles([]);
    setFileInputKey((key) => key + 1);
  }

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Phase</Label>
          <Select value={selectedPhaseId} onValueChange={(value) => { setSelectedPhaseId(value); setSelectedTaskId(""); }}>
            <SelectTrigger aria-label="Finance document phase">
              <SelectValue placeholder="Select phase" />
            </SelectTrigger>
            <SelectContent>
              {phases.map((phase) => (
                <SelectItem key={phase.id} value={phase.id}>
                  {phase.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Task</Label>
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId} disabled={!selectedPhase || tasksQuery.isLoading || tasks.length === 0}>
            <SelectTrigger aria-label="Finance document task">
              <SelectValue placeholder={tasksQuery.isLoading ? "Loading tasks" : "Select task"} />
            </SelectTrigger>
            <SelectContent>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-3">
        <Label htmlFor="finance-document-upload">Upload finance document</Label>
        <Input key={fileInputKey} id="finance-document-upload" type="file" multiple className="mt-2" disabled={!selectedTaskId || uploadFile.isPending} onChange={(event) => onSelectFiles(event.target.files)} />
      </div>
      {selectedFiles.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {selectedFiles.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center justify-between gap-3 rounded-md border bg-surface px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">{file.name}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedFiles((files) => files.filter((_file, fileIndex) => fileIndex !== index))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {uploadFile.error ? <p className="mt-3 text-sm text-error">{dashboardErrorMessage(uploadFile.error)}</p> : null}
      <div className="mt-3 flex justify-end">
        <Button type="button" disabled={!selectedTaskId || selectedFiles.length === 0 || uploadFile.isPending} onClick={onUpload}>
          {uploadFile.isPending ? "Uploading..." : "Upload"}
        </Button>
      </div>
    </div>
  );
}

function ProjectFilesSection({ projectId }: { projectId: string }) {
  const filesQuery = useProjectFilesQuery(projectId);

  if (filesQuery.isLoading) {
    return <LoadingState label="Loading project files" />;
  }

  if (filesQuery.isError) {
    return <ErrorState title="Files could not be loaded" message={dashboardErrorMessage(filesQuery.error)} />;
  }

  const files = filesQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Files</CardTitle>
        <CardDescription>Files uploaded inside this project.</CardDescription>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <EmptyState title="No files uploaded yet." />
        ) : (
          <div className="divide-y rounded-md border bg-surface">
            {files.map((file) => (
              <ProjectFileRow key={file.id} file={file} projectId={projectId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectFileRow({ file, projectId }: { file: ProjectFile; projectId: string }) {
  const downloadFile = useDownloadProjectFileMutation(projectId);
  const downloadError = downloadFile.error ? dashboardErrorMessage(downloadFile.error) : null;

  async function onDownload() {
    try {
      const downloadedFile = await downloadFile.mutateAsync(file.id);
      const objectUrl = URL.createObjectURL(downloadedFile.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadedFile.fileName || file.file_name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      return;
    }
  }

  return (
    <div className="px-3 py-3">
      {downloadError ? <p className="mb-2 text-sm text-error">{downloadError}</p> : null}
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{file.file_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {file.phase_name} / {file.task_name} / {formatFileCategory(file.file_category)}
          </p>
          {file.setup_document_type ? <p className="mt-1 text-xs text-muted-foreground">Document category: {file.setup_document_type}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Uploaded by {file.uploader_name} on {formatDateTime(file.created_at)}
          </p>
        </div>
        <div className="flex gap-2"><FilePreviewDialog disabled={downloadFile.isPending} fileName={file.file_name} fileType={file.file_type} loadFile={() => downloadFile.mutateAsync(file.id)} /><Button type="button" variant="outline" size="sm" disabled={downloadFile.isPending} onClick={() => void onDownload()} aria-label={`Download ${file.file_name}`}><Download className="size-4" aria-hidden="true" />{downloadFile.isPending ? "Downloading..." : "Download"}</Button></div>
      </div>
    </div>
  );
}

function PhasesSection({
  currentPhaseId,
  description,
  isProjectPm,
  phases,
  projectId,
  projectMembers,
  title,
}: {
  projectId: string;
  phases: DashboardPhase[];
  currentPhaseId: string | null;
  description: string;
  isProjectPm: boolean;
  projectMembers: ProjectMember[];
  title: string;
}) {
  return (
    <Card className={cn(isProjectPm && "border-brand-red/20")}>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {isProjectPm ? (
          <PhaseManagementDialog projectId={projectId} phases={phases} currentPhaseId={currentPhaseId}>
            <Button type="button" size="sm" className="bg-brand-red text-white hover:bg-brand-red/90">
              <ListChecks className="size-4" aria-hidden="true" />
              Manage
            </Button>
          </PhaseManagementDialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {phases.length === 0 ? (
          <EmptyState title="No phases have been added yet." />
        ) : (
          <div className="space-y-3">
            {phases.map((phase) => (
              <details
                key={phase.id}
                className={cn("rounded-md border bg-background p-4", isProjectPm && (phase.status === "In Progress" || phase.id === currentPhaseId) && "border-brand-red/25 bg-brand-red/5")}
                open={phase.status === "In Progress" || phase.id === currentPhaseId}
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{phase.name}</h3>
                        <StatusBadge value={phase.status} />
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
                </summary>
                <div className="pt-1">
                  <PhasePeople
                    isProjectPm={isProjectPm}
                    phase={phase}
                    projectId={projectId}
                    projectMembers={projectMembers}
                  />
                  <PhaseTasks isProjectPm={isProjectPm} projectId={projectId} phase={phase} />
                </div>
              </details>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PhasePeople({
  isProjectPm,
  phase,
  projectId,
  projectMembers,
}: {
  isProjectPm: boolean;
  phase: DashboardPhase;
  projectId: string;
  projectMembers: ProjectMember[];
}) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const phaseMembersQuery = usePhaseMembersQuery(projectId, phase.id, true);
  const addPhaseMember = useAddPhaseMemberMutation(projectId, phase.id);
  const removePhaseMember = useRemovePhaseMemberMutation(projectId, phase.id);
  const phaseMembers = useMemo(() => phaseMembersQuery.data ?? [], [phaseMembersQuery.data]);
  const phaseMemberIds = useMemo(() => new Set(phaseMembers.map((member) => member.user_id)), [phaseMembers]);
  const projectMemberIds = useMemo(() => new Set(projectMembers.map((member) => member.user_id)), [projectMembers]);
  const knownUsers = projectMembers
    .filter((member) => !phaseMemberIds.has(member.user_id))
    .map((member) => ({ id: member.user_id, name: member.name, email: member.email }));
  const selectedAlreadyAssigned = phaseMemberIds.has(selectedUserId);
  const selectedOutsideProject = Boolean(selectedUserId) && !projectMemberIds.has(selectedUserId);
  const isSaving = addPhaseMember.isPending || removePhaseMember.isPending;

  async function onAddPhaseMember() {
    if (!selectedUserId || selectedAlreadyAssigned || selectedOutsideProject) {
      return;
    }

    await addPhaseMember.mutateAsync(selectedUserId);
    setSelectedUserId("");
  }

  return (
    <div className="mt-4 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          <h4 className="text-sm font-medium text-foreground">People</h4>
        </div>
        <span className="text-xs text-muted-foreground">{phaseMembers.length} assigned</span>
      </div>

      {phaseMembersQuery.isLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading people...</p> : null}
      {phaseMembersQuery.isError ? <p className="mt-2 text-sm text-error">Phase people could not be loaded.</p> : null}

      {!phaseMembersQuery.isLoading && !phaseMembersQuery.isError ? (
        phaseMembers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No people assigned to this phase.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {phaseMembers.map((member) => (
              <PhasePersonChip
                key={member.user_id}
                disabled={isSaving}
                isProjectPm={isProjectPm}
                member={member}
                onRemove={() => removePhaseMember.mutate(member.user_id)}
              />
            ))}
          </div>
        )
      ) : null}

      {isProjectPm ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <UserSearchSelect
            label={`Add person to ${phase.name}`}
            value={selectedUserId}
            onValueChange={setSelectedUserId}
            placeholder="Search project member"
            disabled={isSaving || projectMembers.length === 0}
            knownUsers={knownUsers}
            filterUser={(candidate) => projectMemberIds.has(candidate.id) && !phaseMemberIds.has(candidate.id)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!selectedUserId || selectedAlreadyAssigned || selectedOutsideProject || isSaving}
            onClick={onAddPhaseMember}
          >
            <UserPlus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </div>
      ) : null}

      {addPhaseMember.error ? <p className="mt-2 text-sm text-error">{phaseMemberErrorMessage(addPhaseMember.error)}</p> : null}
      {removePhaseMember.error ? <p className="mt-2 text-sm text-error">{phaseMemberErrorMessage(removePhaseMember.error)}</p> : null}
    </div>
  );
}

function PhasePersonChip({
  disabled,
  isProjectPm,
  member,
  onRemove,
}: {
  disabled: boolean;
  isProjectPm: boolean;
  member: PhaseMember;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{member.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
      </span>
      {isProjectPm ? (
        <Button type="button" variant="ghost" size="icon" disabled={disabled} onClick={onRemove} aria-label={`Remove ${member.name}`}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </span>
  );
}

function phaseMemberErrorMessage(error: Error) {
  if (error instanceof ApiError) {
    return userFacingErrorMessage(error, {
      conflict: "That person is already assigned to this phase.",
      validation: "Only existing project members can be assigned to a phase.",
      forbidden: "Only project PMs can manage phase people.",
      action: "phase people",
    });
  }

  return "Phase people could not be updated.";
}

function DeadlinesSection({ deadlines }: { deadlines: UpcomingDeadline[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Deadlines</CardTitle>
        <CardDescription>Project, phase, and task due dates coming up soon.</CardDescription>
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

function ProjectChecklistSection({ deliverables }: { deliverables: DashboardDeliverable[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist</CardTitle>
        <CardDescription>Open checklist items across project tasks.</CardDescription>
      </CardHeader>
      <CardContent>
        {deliverables.length === 0 ? (
          <EmptyState title="No checklist items available." description="Task checklist items will appear here when they exist." />
        ) : (
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    What needs doing
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
    project_lead: dashboard.project.project_lead,
    current_phase_id: dashboard.project.current_phase_id,
    start_date: dashboard.project.start_date,
    end_date: dashboard.project.end_date,
    status: dashboard.project.status,
    health: dashboard.project.health,
    health_color: dashboard.project.health_color,
    health_label: dashboard.project.health_label,
    health_reasons: dashboard.project.health_reasons,
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

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatFileCategory(value: ProjectFile["file_category"]) {
  if (value === "work_submission") {
    return "Work submission";
  }
  if (value === "finance") {
    return "Finance";
  }
  return "Reference";
}

type PieSegment = {
  id: string;
  kind: "phase" | "unutilized";
  percent: number;
  start: number;
  end: number;
};

function buildPieSegments(phases: DashboardPhase[], allocated: number, totalSpent: number): PieSegment[] {
  if (allocated <= 0) {
    return [];
  }

  let offset = 0;
  const segments: PieSegment[] = phases
    .filter((phase) => phase.budget_spent > 0 && totalSpent > 0)
    .map((phase) => {
      const remainingPercent = Math.max(100 - offset, 0);
      const percent = Math.min((phase.budget_spent / allocated) * 100, remainingPercent);
      const segment = {
        id: phase.id,
        kind: "phase" as const,
        percent,
        start: offset,
        end: offset + percent,
      };
      offset += percent;
      return segment;
    });

  const unutilizedPercent = Math.max(((allocated - totalSpent) / allocated) * 100, 0);
  if (unutilizedPercent > 0) {
    segments.push({
      id: "unutilized",
      kind: "unutilized",
      percent: unutilizedPercent,
      start: offset,
      end: offset + unutilizedPercent,
    });
  }

  return segments;
}

function buildDonutBackground(segments: PieSegment[]) {
  if (segments.length === 0) {
    return "#d1d5db";
  }

  const colors = ["#2c5aa0", "#3d8a43", "#7c3aed", "#ca8a04", "#0891b2", "#0f766e"];
  return `conic-gradient(${segments
    .map((segment, index) => {
      const color = segment.kind === "unutilized" ? "#b85622" : colors[index % colors.length];
      return `${color} ${segment.start}% ${segment.end}%`;
    })
    .join(", ")})`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function isNonNegativeNumber(value: string) {
  const numberValue = Number(value);
  return value.trim() !== "" && Number.isFinite(numberValue) && numberValue >= 0;
}

function formatEntityType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
