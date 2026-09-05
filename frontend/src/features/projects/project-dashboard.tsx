import { AlertTriangle, Archive, CalendarDays, CheckCircle2, Clock, DollarSign, Edit, ListChecks, Save, UserPlus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

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
import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";
import { UserSearchSelect } from "@/features/users/user-search-select";
import { userFacingErrorMessage } from "@/lib/api-errors";

import {
  useAddPhaseMemberMutation,
  useArchiveProjectMutation,
  useAttentionQuery,
  usePhaseMembersQuery,
  useProjectBudgetQuery,
  useProjectDashboardQuery,
  useProjectMembersQuery,
  useProjectQuery,
  useRemovePhaseMemberMutation,
  useUpdateProjectBudgetMutation,
} from "./hooks";
import { PhaseManagementDialog } from "./phase-management-dialog";
import { PhaseTasks } from "./phase-tasks";
import { ProjectFormDialog } from "./project-form-dialog";
import { ProjectMembersDialog } from "./project-members-dialog";
import type { DashboardDeliverable, DashboardPhase, PhaseMember, ProjectDashboard, ProjectMember, UpcomingDeadline } from "./types";

export function ProjectDashboardPage() {
  const { projectId } = useParams();

  if (!projectId) {
    return <ErrorState title="Project not found" message="The project route is missing an ID." />;
  }

  return <ProjectDashboardContent projectId={projectId} />;
}

function ProjectDashboardContent({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dashboardQuery = useProjectDashboardQuery(projectId);
  const projectQuery = useProjectQuery(projectId);
  const projectMembersQuery = useProjectMembersQuery(projectId, true);
  const attentionQuery = useAttentionQuery();
  const archiveProject = useArchiveProjectMutation(projectId);
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
  const currentMember = projectMembersQuery.data?.find((member) => member.user_id === user?.id);
  const isProjectPm = currentMember?.role === "PM";
  const canManageBudget = currentMember?.role === "PM" || currentMember?.role === "Finance";
  const projectAttention = (attentionQuery.data ?? []).filter((item) => item.project_id === projectId);

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
          {isProjectPm ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <ProjectFormDialog mode="edit" project={editProject} open={editOpen} onOpenChange={setEditOpen}>
                <Button type="button" variant="outline" size="sm" disabled={projectQuery.isLoading || !editProject}>
                  <Edit className="size-4" aria-hidden="true" />
                  Edit
                </Button>
              </ProjectFormDialog>
              <ProjectMembersDialog project={projectForMembers(dashboard)} open={membersOpen} onOpenChange={setMembersOpen}>
                <Button type="button" variant="outline" size="sm">
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
                <Button type="button" variant="ghost" size="sm" disabled={archiveProject.isPending}>
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
        <SummaryCard title="Attention">
          <div className="flex items-center gap-2">
            <AlertTriangle className={projectAttention.length > 0 ? "size-4 text-warning" : "size-4 text-muted-foreground"} aria-hidden="true" />
            <span className="text-sm font-semibold text-foreground">
              {projectAttention.length} item{projectAttention.length === 1 ? "" : "s"}
            </span>
          </div>
        </SummaryCard>
      </div>

      {canManageBudget ? <BudgetSection projectId={projectId} /> : null}

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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.45fr)]">
        <PhasesSection projectId={projectId} phases={dashboard.phases} currentPhaseId={dashboard.project.current_phase_id} />
        <DeadlinesSection deadlines={dashboard.upcoming_deadlines} />
      </div>

      <ProjectChecklistSection deliverables={dashboard.deliverables} />
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

function BudgetSection({ projectId }: { projectId: string }) {
  const budgetQuery = useProjectBudgetQuery(projectId);
  const updateBudget = useUpdateProjectBudgetMutation(projectId);
  const [allocated, setAllocated] = useState("");
  const [spent, setSpent] = useState("");

  useEffect(() => {
    if (budgetQuery.data) {
      setAllocated(String(budgetQuery.data.allocated));
      setSpent(String(budgetQuery.data.spent));
    }
  }, [budgetQuery.data]);

  async function onSave() {
    await updateBudget.mutateAsync({
      allocated: Number(allocated),
      spent: Number(spent),
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

  const hasInvalidValues = !isNonNegativeNumber(allocated) || !isNonNegativeNumber(spent);

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="size-5 text-success" aria-hidden="true" />
            Budget
          </CardTitle>
          <CardDescription>Project-level budget only.</CardDescription>
        </div>
        <Button type="button" variant="outline" disabled={hasInvalidValues || updateBudget.isPending} onClick={onSave}>
          <Save className="size-4" aria-hidden="true" />
          {updateBudget.isPending ? "Saving..." : "Save Budget"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <BudgetMetric label="Allocated" value={formatCurrency(budgetQuery.data.allocated)} />
          <BudgetMetric label="Spent" value={formatCurrency(budgetQuery.data.spent)} />
          <BudgetMetric label="Remaining" value={formatCurrency(budgetQuery.data.remaining)} tone={budgetQuery.data.remaining < 0 ? "error" : "default"} />
          <BudgetMetric label="Utilisation" value={formatPercent(budgetQuery.data.utilisation)} />
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
          <div className="space-y-2">
            <Label htmlFor="budget-spent">Spent</Label>
            <Input id="budget-spent" type="number" min="0" step="0.01" value={spent} onChange={(event) => setSpent(event.target.value)} />
          </div>
        </div>
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

function PhasesSection({ currentPhaseId, phases, projectId }: { projectId: string; phases: DashboardPhase[]; currentPhaseId: string | null }) {
  const { user } = useAuth();
  const projectMembersQuery = useProjectMembersQuery(projectId, true);
  const projectMembers = projectMembersQuery.data ?? [];
  const currentMember = projectMembers.find((member) => member.user_id === user?.id);
  const isProjectPm = currentMember?.role === "PM";

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Phases</CardTitle>
          <CardDescription>Open a phase to see its people and tasks.</CardDescription>
        </div>
        {isProjectPm ? (
          <PhaseManagementDialog projectId={projectId} phases={phases} currentPhaseId={currentPhaseId}>
            <Button type="button" variant="outline" size="sm">
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
              <details key={phase.id} className="rounded-md border bg-background p-4" open={phase.status === "In Progress" || phase.id === currentPhaseId}>
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
