import { Check, CheckCircle2, Circle, ClipboardList, Edit, Eye, FileClock, Plus, Save, UserPlus, Users, X, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { userFacingErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

import {
  useAddPhaseMemberMutation,
  useCreateProjectSetupDeliverableMutation,
  useCreateProjectSetupMilestoneMutation,
  useCreateProjectSetupResourceMutation,
  usePhaseMembersQuery,
  useProjectMembersQuery,
  useProjectBudgetQuery,
  useProjectSetupDeliverablesQuery,
  useProjectSetupMilestonesQuery,
  useProjectSetupResourcesQuery,
  useProjectSetupBudgetQuery,
  useProjectSetupQuery,
  useUpdateProjectSetupBudgetMutation,
  useRemovePhaseMemberMutation,
  useTasksQuery,
  useUpdateProjectSetupDetailsMutation,
  useUpdateProjectSetupSectionMutation,
} from "./hooks";
import { PhaseFormDialog } from "./phase-form-dialog";
import { PhaseTasks } from "./phase-tasks";
import { ProjectMembersDialog } from "./project-members-dialog";
import type {
  DashboardPhase,
  ProjectDashboard,
  ProjectMember,
  ProjectSetupBudgetPayload,
  ProjectSetupDeliverablePayload,
  ProjectSetupMilestonePayload,
  ProjectSetupResourcePayload,
  ProjectSetupResourceType,
  ProjectSetup,
  ProjectSetupDetailsPayload,
  ProjectSetupDetailsSection,
  ProjectSetupSection,
  ProjectSetupStatus,
} from "./types";

const SETUP_STATUSES: ProjectSetupStatus[] = ["Complete", "In Progress", "Not Started", "Not Applicable"];

export function ProjectSetupCard({ onContinue, setup }: { setup: ProjectSetup; onContinue: () => void }) {
  return (
    <Card className="border-brand-red/20">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardDescription className="font-medium text-brand-red">PROJECT SETUP - PHASE 0</CardDescription>
          <CardTitle>{setup.title}</CardTitle>
          <CardDescription>Complete your project setup to define phases, team, budget, risks and supporting information.</CardDescription>
        </div>
        <Button type="button" className="bg-brand-red text-white hover:bg-brand-red/90" onClick={onContinue}>
          <ClipboardList className="size-4" aria-hidden="true" />
          Continue Setup
        </Button>
      </CardHeader>
      <CardContent>
        <SetupProgress setup={setup} />
      </CardContent>
    </Card>
  );
}

export function ProjectSetupPrompt({
  onClose,
  onContinue,
  projectName,
  setup,
}: {
  projectName: string;
  setup: ProjectSetup;
  onClose: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardDescription className="font-medium text-brand-red">PROJECT SETUP</CardDescription>
          <CardTitle>{setup.title}</CardTitle>
          <CardDescription>
            {Math.round(setup.summary.percent_complete)}% Complete for {projectName}
          </CardDescription>
        </div>
        <Badge variant="outline">Project remains usable</Badge>
      </div>
      <p className="text-sm text-muted-foreground">Complete your project setup to define phases, team, budget, risks and supporting information.</p>
      <SetupProgress setup={setup} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="bg-brand-red text-white hover:bg-brand-red/90" onClick={onContinue}>
          Continue Project Setup
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Do Later
        </Button>
      </div>
    </div>
  );
}

export function ProjectSetupPanel({ canEdit, dashboard, projectId }: { projectId: string; canEdit: boolean; dashboard: ProjectDashboard }) {
  const setupQuery = useProjectSetupQuery(projectId);
  const membersQuery = useProjectMembersQuery(projectId, true);
  const updateDetails = useUpdateProjectSetupDetailsMutation(projectId);
  const updateSection = useUpdateProjectSetupSectionMutation(projectId);
  const setup = setupQuery.data;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeSection = useMemo(() => {
    if (!setup) {
      return null;
    }
    return setup.sections.find((section) => section.key === activeKey) ?? setup.sections[0] ?? null;
  }, [activeKey, setup]);

  async function onStatusChange(section: ProjectSetupSection, statusValue: ProjectSetupStatus) {
    await updateSection.mutateAsync({ sectionKey: section.key, payload: { status: statusValue } });
  }

  async function onMarkComplete(section: ProjectSetupSection) {
    await updateSection.mutateAsync({ sectionKey: section.key, payload: { status: "Complete" } });
  }

  async function onSaveDetails(section: ProjectSetupDetailsSection, payload: ProjectSetupDetailsPayload) {
    await updateDetails.mutateAsync({ section, payload });
  }

  if (setupQuery.isLoading) {
    return <LoadingState label="Loading project setup" />;
  }

  if (setupQuery.isError) {
    return <ErrorState title="Project setup could not be loaded" message={userFacingErrorMessage(setupQuery.error, { action: "project setup" })} />;
  }

  if (!setup || !activeSection) {
    return <EmptyState title="Project setup is unavailable." />;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardDescription>PROJECT SETUP - PHASE 0</CardDescription>
          <CardTitle>{setup.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SetupProgress setup={setup} />
          <nav aria-label="Project setup sections" className="space-y-1">
            {setup.sections.map((section, index) => (
              <button
                key={section.key}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted",
                  section.key === activeSection.key && "bg-muted text-foreground",
                )}
                onClick={() => setActiveKey(section.key)}
              >
                <span className="w-5 shrink-0 text-xs font-medium text-muted-foreground">{index + 1}</span>
                <SetupStatusIcon status={section.status} />
                <span className="min-w-0 flex-1 truncate">{section.label}</span>
              </button>
            ))}
          </nav>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div>
            <CardDescription>Section</CardDescription>
            <CardTitle>{activeSection.label}</CardTitle>
            {activeSection.live_source ? <CardDescription>Live source: {activeSection.live_source}</CardDescription> : null}
          </div>
          <div className="min-w-52">
            {canEdit && !isFirstPassSection(activeSection.key) ? (
              <Select value={activeSection.status} onValueChange={(value) => onStatusChange(activeSection, value as ProjectSetupStatus)}>
                <SelectTrigger aria-label={`${activeSection.label} status`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SETUP_STATUSES.filter((statusValue) => activeSection.optional || statusValue !== "Not Applicable").map((statusValue) => (
                    <SelectItem key={statusValue} value={statusValue}>
                      {statusValue}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : isFirstPassSection(activeSection.key) ? (
              <Badge variant="outline">{activeSection.status}</Badge>
            ) : (
              <Badge variant="outline">
                <Eye className="mr-1 size-3" aria-hidden="true" />
                View Only
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {updateSection.error ? <p className="text-sm text-error">{userFacingErrorMessage(updateSection.error, { action: "project setup" })}</p> : null}
          {updateDetails.error ? <p className="text-sm text-error">{userFacingErrorMessage(updateDetails.error, { action: "project setup" })}</p> : null}
          {renderFirstPassSection({
            activeSection,
            canEdit,
            isSaving: updateDetails.isPending,
            onMarkComplete,
            onSaveDetails,
            dashboard,
            members: membersQuery.data ?? [],
            membersError: membersQuery.error,
            membersLoading: membersQuery.isLoading,
            setup,
            statusPending: updateSection.isPending,
          })}
          <div className="grid gap-4 md:grid-cols-3">
            <SetupMetric label="Status" value={activeSection.status} />
            <SetupMetric label="Live Items" value={String(activeSection.live_items_count)} />
            <SetupMetric label="Optional" value={activeSection.optional ? "Yes" : "No"} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SetupProgress({ setup }: { setup: ProjectSetup }) {
  const percent = Math.round(setup.summary.percent_complete);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{setup.summary.complete_sections} of {setup.summary.total_applicable_sections} applicable sections complete</span>
        <span className="font-semibold text-foreground">{percent}% Complete</span>
      </div>
      <Progress value={percent} aria-label={`Project setup ${percent}% complete`} />
    </div>
  );
}

function renderFirstPassSection({
  activeSection,
  canEdit,
  dashboard,
  isSaving,
  members,
  membersError,
  membersLoading,
  onMarkComplete,
  onSaveDetails,
  setup,
  statusPending,
}: {
  activeSection: ProjectSetupSection;
  canEdit: boolean;
  dashboard: ProjectDashboard;
  isSaving: boolean;
  members: ProjectMember[];
  membersError: Error | null;
  membersLoading: boolean;
  onMarkComplete: (section: ProjectSetupSection) => Promise<void>;
  onSaveDetails: (section: ProjectSetupDetailsSection, payload: ProjectSetupDetailsPayload) => Promise<void>;
  setup: ProjectSetup;
  statusPending: boolean;
}) {
  if (activeSection.key === "project_overview") {
    return (
      <ProjectOverviewForm
        canEdit={canEdit}
        isSaving={isSaving}
        onMarkComplete={() => onMarkComplete(activeSection)}
        onSave={(payload) => onSaveDetails("project-overview", payload)}
        statusPending={statusPending}
        setup={setup}
      />
    );
  }
  if (activeSection.key === "scope") {
    return (
      <ScopeForm
        canEdit={canEdit}
        isSaving={isSaving}
        onMarkComplete={() => onMarkComplete(activeSection)}
        onSave={(payload) => onSaveDetails("scope", payload)}
        statusPending={statusPending}
        setup={setup}
      />
    );
  }
  if (activeSection.key === "objectives_outcomes") {
    return (
      <ObjectivesForm
        canEdit={canEdit}
        isSaving={isSaving}
        onMarkComplete={() => onMarkComplete(activeSection)}
        onSave={(payload) => onSaveDetails("objectives-outcomes", payload)}
        statusPending={statusPending}
        setup={setup}
      />
    );
  }
  if (activeSection.key === "work_plan") {
    return (
      <WorkPlanForm
        canEdit={canEdit}
        isSaving={isSaving}
        onMarkComplete={() => onMarkComplete(activeSection)}
        onSave={(payload) => onSaveDetails("work-plan", payload)}
        statusPending={statusPending}
        setup={setup}
      />
    );
  }
  if (activeSection.key === "phases") {
    return <Phase0PhasesSection canEdit={canEdit} dashboard={dashboard} members={members} projectId={setup.project_id} />;
  }
  if (activeSection.key === "milestones") {
    return <Phase0MilestonesSection canEdit={canEdit} members={members} projectId={setup.project_id} />;
  }
  if (activeSection.key === "deliverables") {
    return <Phase0DeliverablesSection canEdit={canEdit} dashboard={dashboard} members={members} projectId={setup.project_id} />;
  }
  if (activeSection.key === "people_governance") {
    return (
      <Phase0PeopleSection
        canEdit={canEdit}
        dashboard={dashboard}
        members={members}
        membersError={membersError}
        membersLoading={membersLoading}
      />
    );
  }
  if (activeSection.key === "budget_setup") {
    return <Phase0BudgetSection canEdit={canEdit} dashboard={dashboard} projectId={setup.project_id} />;
  }
  if (activeSection.key === "resources") {
    return <Phase0ResourcesSection canEdit={canEdit} projectId={setup.project_id} />;
  }
  return null;
}

function isFirstPassSection(sectionKey: string) {
  return ["project_overview", "scope", "objectives_outcomes", "work_plan"].includes(sectionKey);
}

function ProjectOverviewForm({
  canEdit,
  isSaving,
  onMarkComplete,
  onSave,
  setup,
  statusPending,
}: FirstPassFormProps) {
  const details = setup.details.project_overview;
  const [form, setForm] = useState({
    description: details.description,
    end_date: details.end_date,
    name: details.name,
    project_location_area: details.project_location_area ?? "",
    start_date: details.start_date,
  });

  useEffect(() => {
    setForm({
      description: details.description,
      end_date: details.end_date,
      name: details.name,
      project_location_area: details.project_location_area ?? "",
      start_date: details.start_date,
    });
  }, [details]);

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event, onSave, form)}>
      <div className="grid gap-4 md:grid-cols-2">
        <SetupInput label="Project Name" value={form.name} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
        <SetupInput label="Project Code" value={details.code} disabled readOnly />
        <SetupInput label="Project Lead" value={`${details.project_lead.name} (${details.project_lead.email})`} disabled readOnly />
        <SetupInput
          label="Project Location / Area"
          value={form.project_location_area}
          disabled={!canEdit}
          onChange={(value) => setForm((current) => ({ ...current, project_location_area: value }))}
        />
        <SetupInput label="Start Date" type="date" value={form.start_date} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, start_date: value }))} />
        <SetupInput label="Target End Date" type="date" value={form.end_date} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, end_date: value }))} />
      </div>
      <SetupTextarea label="Project Purpose / Background" value={form.description} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
      <SetupActions canEdit={canEdit} isSaving={isSaving} onMarkComplete={onMarkComplete} statusPending={statusPending} />
    </form>
  );
}

function ScopeForm({ canEdit, isSaving, onMarkComplete, onSave, setup, statusPending }: FirstPassFormProps) {
  const details = setup.details.scope;
  const [form, setForm] = useState({
    scope_boundaries: details.scope_boundaries ?? "",
    scope_in: details.scope_in ?? "",
    scope_notes: details.scope_notes ?? "",
    scope_out: details.scope_out ?? "",
  });

  useEffect(() => {
    setForm({
      scope_boundaries: details.scope_boundaries ?? "",
      scope_in: details.scope_in ?? "",
      scope_notes: details.scope_notes ?? "",
      scope_out: details.scope_out ?? "",
    });
  }, [details]);

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event, onSave, form)}>
      <SetupTextarea label="In Scope" value={form.scope_in} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, scope_in: value }))} />
      <SetupTextarea label="Out of Scope" value={form.scope_out} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, scope_out: value }))} />
      <SetupTextarea label="Scope Boundaries" value={form.scope_boundaries} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, scope_boundaries: value }))} />
      <SetupTextarea label="Scope Notes" value={form.scope_notes} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, scope_notes: value }))} />
      <SetupActions canEdit={canEdit} isSaving={isSaving} onMarkComplete={onMarkComplete} statusPending={statusPending} />
    </form>
  );
}

function ObjectivesForm({ canEdit, isSaving, onMarkComplete, onSave, setup, statusPending }: FirstPassFormProps) {
  const details = setup.details.objectives_outcomes;
  const [form, setForm] = useState({
    expected_outcomes: details.expected_outcomes ?? "",
    key_indicators: details.key_indicators ?? "",
    objectives: details.objectives ?? "",
    success_criteria: details.success_criteria ?? "",
  });

  useEffect(() => {
    setForm({
      expected_outcomes: details.expected_outcomes ?? "",
      key_indicators: details.key_indicators ?? "",
      objectives: details.objectives ?? "",
      success_criteria: details.success_criteria ?? "",
    });
  }, [details]);

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event, onSave, form)}>
      <SetupTextarea label="Objectives" value={form.objectives} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, objectives: value }))} />
      <SetupTextarea label="Expected Outcomes" value={form.expected_outcomes} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, expected_outcomes: value }))} />
      <SetupTextarea label="Success Criteria" value={form.success_criteria} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, success_criteria: value }))} />
      <SetupTextarea label="Key Indicators / Measures" value={form.key_indicators} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, key_indicators: value }))} />
      <SetupActions canEdit={canEdit} isSaving={isSaving} onMarkComplete={onMarkComplete} statusPending={statusPending} />
    </form>
  );
}

function WorkPlanForm({ canEdit, isSaving, onMarkComplete, onSave, setup, statusPending }: FirstPassFormProps) {
  const details = setup.details.work_plan;
  const [form, setForm] = useState({
    end_date: details.planned_completion,
    key_activities: details.key_activities ?? "",
    start_date: details.planned_start,
    work_plan_details: details.work_plan_details ?? "",
  });

  useEffect(() => {
    setForm({
      end_date: details.planned_completion,
      key_activities: details.key_activities ?? "",
      start_date: details.planned_start,
      work_plan_details: details.work_plan_details ?? "",
    });
  }, [details]);

  return (
    <form className="space-y-4" onSubmit={(event) => void handleSubmit(event, onSave, form)}>
      <div className="grid gap-4 md:grid-cols-2">
        <SetupInput label="Planned Start" type="date" value={form.start_date} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, start_date: value }))} />
        <SetupInput label="Planned Completion" type="date" value={form.end_date} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, end_date: value }))} />
      </div>
      <SetupTextarea label="Work Plan Details" value={form.work_plan_details} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, work_plan_details: value }))} />
      <SetupTextarea label="Key Activities" value={form.key_activities} disabled={!canEdit} onChange={(value) => setForm((current) => ({ ...current, key_activities: value }))} />
      <SetupActions canEdit={canEdit} isSaving={isSaving} onMarkComplete={onMarkComplete} statusPending={statusPending} />
    </form>
  );
}

function Phase0PhasesSection({
  canEdit,
  dashboard,
  members,
  projectId,
}: {
  canEdit: boolean;
  dashboard: ProjectDashboard;
  members: ProjectMember[];
  projectId: string;
}) {
  const phases = dashboard.phases;
  const nextDisplayOrder = Math.max(0, ...phases.map((phase) => phase.display_order)) + 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Live Project Phases</p>
          <p className="text-sm text-muted-foreground">This section uses the same phases, phase members and tasks as the normal project view.</p>
        </div>
        {canEdit ? (
          <PhaseFormDialog mode="create" projectId={projectId} nextDisplayOrder={nextDisplayOrder}>
            <Button type="button" className="bg-brand-red text-white hover:bg-brand-red/90">
              <Plus className="size-4" aria-hidden="true" />
              Add Phase
            </Button>
          </PhaseFormDialog>
        ) : null}
      </div>

      {phases.length === 0 ? <EmptyState title="No phases have been added to this project." /> : null}
      <div className="space-y-3">
        {phases.map((phase) => (
          <div key={phase.id} className="rounded-md border bg-background">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-foreground">{phase.name}</h4>
                  <StatusBadge value={phase.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{phase.description || "No phase purpose recorded."}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatSetupDate(phase.start_date)} - {formatSetupDate(phase.end_date)}
                </p>
              </div>
              {canEdit ? (
                <PhaseFormDialog mode="edit" projectId={projectId} phase={phase} nextDisplayOrder={phase.display_order}>
                  <Button type="button" variant="outline" size="sm">
                    <Edit className="size-4" aria-hidden="true" />
                    Edit Phase
                  </Button>
                </PhaseFormDialog>
              ) : null}
            </div>
            <div className="space-y-4 p-4">
              <PhaseMemberManager canEdit={canEdit} members={members} phase={phase} projectId={projectId} />
              <PhaseTasks isProjectPm={canEdit} phase={phase} projectId={projectId} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Phase0PeopleSection({
  canEdit,
  dashboard,
  members,
  membersError,
  membersLoading,
}: {
  canEdit: boolean;
  dashboard: ProjectDashboard;
  members: ProjectMember[];
  membersError: Error | null;
  membersLoading: boolean;
}) {
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Live Project People</p>
          <p className="text-sm text-muted-foreground">Membership and roles come from the project member list used across SENSES.</p>
        </div>
        {canEdit ? (
          <ProjectMembersDialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen} project={dashboard.project}>
            <Button type="button" className="bg-brand-red text-white hover:bg-brand-red/90">
              <UserPlus className="size-4" aria-hidden="true" />
              Manage People
            </Button>
          </ProjectMembersDialog>
        ) : null}
      </div>

      {membersLoading ? <LoadingState label="Loading project members" /> : null}
      {membersError ? <ErrorState title="Project members could not be loaded" message={userFacingErrorMessage(membersError, { action: "project members" })} /> : null}
      {!membersLoading && !membersError && members.length === 0 ? <EmptyState title="No project members found." /> : null}
      {!membersLoading && !membersError && members.length > 0 ? (
        <div className="divide-y rounded-md border bg-background">
          {members.map((member) => (
            <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              <Badge variant="outline">{member.role}</Badge>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PhaseMemberManager({
  canEdit,
  members,
  phase,
  projectId,
}: {
  canEdit: boolean;
  members: ProjectMember[];
  phase: DashboardPhase;
  projectId: string;
}) {
  const phaseMembersQuery = usePhaseMembersQuery(projectId, phase.id, true);
  const addPhaseMember = useAddPhaseMemberMutation(projectId, phase.id);
  const removePhaseMember = useRemovePhaseMemberMutation(projectId, phase.id);
  const [selectedUserId, setSelectedUserId] = useState("none");
  const phaseMembers = phaseMembersQuery.data ?? [];
  const availableMembers = members.filter((member) => !phaseMembers.some((phaseMember) => phaseMember.user_id === member.user_id));

  async function addSelectedMember() {
    if (selectedUserId === "none") {
      return;
    }
    try {
      await addPhaseMember.mutateAsync(selectedUserId);
      setSelectedUserId("none");
    } catch {
      return;
    }
  }

  return (
    <div className="rounded-md border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          Phase Members
        </div>
        {canEdit ? (
          <div className="flex min-w-0 flex-1 justify-end gap-2 sm:max-w-md">
            <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={addPhaseMember.isPending || availableMembers.length === 0}>
              <SelectTrigger aria-label={`Assign member to ${phase.name}`} className="min-w-0 flex-1">
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select member</SelectItem>
                {availableMembers.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.name} - {member.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" disabled={selectedUserId === "none" || addPhaseMember.isPending} onClick={() => void addSelectedMember()}>
              Add
            </Button>
          </div>
        ) : null}
      </div>
      {phaseMembersQuery.isLoading ? <LoadingState label="Loading phase members" /> : null}
      {phaseMembersQuery.isError ? (
        <p className="mt-3 text-sm text-error">{userFacingErrorMessage(phaseMembersQuery.error, { action: "phase members" })}</p>
      ) : null}
      {addPhaseMember.error ? <p className="mt-3 text-sm text-error">{userFacingErrorMessage(addPhaseMember.error, { action: "phase members" })}</p> : null}
      {removePhaseMember.error ? <p className="mt-3 text-sm text-error">{userFacingErrorMessage(removePhaseMember.error, { action: "phase members" })}</p> : null}
      {!phaseMembersQuery.isLoading && !phaseMembersQuery.isError ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {phaseMembers.length === 0 ? <p className="text-sm text-muted-foreground">No members assigned to this phase.</p> : null}
          {phaseMembers.map((member) => (
            <Badge key={member.user_id} variant="outline" className="gap-1">
              {member.name}
              {canEdit ? (
                <button
                  type="button"
                  className="rounded-full p-0.5 text-muted-foreground hover:text-error"
                  disabled={removePhaseMember.isPending}
                  onClick={() => removePhaseMember.mutate(member.user_id)}
                  aria-label={`Remove ${member.name} from ${phase.name}`}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Phase0MilestonesSection({ canEdit, members, projectId }: { canEdit: boolean; members: ProjectMember[]; projectId: string }) {
  const milestonesQuery = useProjectSetupMilestonesQuery(projectId);
  const createMilestone = useCreateProjectSetupMilestoneMutation(projectId);
  const [form, setForm] = useState<ProjectSetupMilestonePayload>({
    name: "",
    responsible_user_id: null,
    status: "Not Started",
    target_date: "",
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createMilestone.mutateAsync({ ...form, name: form.name.trim(), responsible_user_id: form.responsible_user_id || null });
    setForm({ name: "", responsible_user_id: null, status: "Not Started", target_date: "" });
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <form className="rounded-md border bg-background p-4" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,14rem)_10rem_auto]">
            <Input value={form.name} placeholder="Milestone" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <Input type="date" value={form.target_date} onChange={(event) => setForm((current) => ({ ...current, target_date: event.target.value }))} />
            <Select value={form.responsible_user_id ?? "none"} onValueChange={(value) => setForm((current) => ({ ...current, responsible_user_id: value === "none" ? null : value }))}>
              <SelectTrigger aria-label="Responsible person"><SelectValue placeholder="Responsible person" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No responsible person</SelectItem>
                {members.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as ProjectSetupMilestonePayload["status"] }))}>
              <SelectTrigger aria-label="Milestone status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Not Started", "In Progress", "Complete"].map((statusValue) => <SelectItem key={statusValue} value={statusValue}>{statusValue}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={!form.name.trim() || !form.target_date || createMilestone.isPending}>
              <Plus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </div>
          {createMilestone.error ? <p className="mt-3 text-sm text-error">{userFacingErrorMessage(createMilestone.error, { action: "milestone" })}</p> : null}
        </form>
      ) : null}
      {milestonesQuery.isLoading ? <LoadingState label="Loading milestones" /> : null}
      {milestonesQuery.isError ? <ErrorState title="Milestones could not be loaded" message={userFacingErrorMessage(milestonesQuery.error, { action: "milestones" })} /> : null}
      {milestonesQuery.data?.length === 0 ? <EmptyState title="No milestones have been added." /> : null}
      <div className="space-y-2">
        {milestonesQuery.data?.map((milestone) => (
          <div key={milestone.id} className="grid gap-2 rounded-md border bg-background p-3 text-sm md:grid-cols-[minmax(0,1fr)_10rem_minmax(0,14rem)_8rem]">
            <span className="font-medium text-foreground">{milestone.name}</span>
            <span className="text-muted-foreground">{formatSetupDate(milestone.target_date)}</span>
            <span className="text-muted-foreground">{milestone.responsible_person?.name ?? "No responsible person"}</span>
            <Badge variant="outline">{milestone.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function Phase0DeliverablesSection({
  canEdit,
  dashboard,
  members,
  projectId,
}: {
  canEdit: boolean;
  dashboard: ProjectDashboard;
  members: ProjectMember[];
  projectId: string;
}) {
  const deliverablesQuery = useProjectSetupDeliverablesQuery(projectId);
  const createDeliverable = useCreateProjectSetupDeliverableMutation(projectId);
  const [phaseId, setPhaseId] = useState(dashboard.phases[0]?.id ?? "");
  const tasksQuery = useTasksQuery(projectId, phaseId, Boolean(phaseId));
  const [form, setForm] = useState<ProjectSetupDeliverablePayload>({
    acceptance_criteria: null,
    approver_id: null,
    description: "",
    due_date: null,
    owner_id: null,
    task_id: "",
  });

  useEffect(() => {
    if (!phaseId && dashboard.phases[0]?.id) {
      setPhaseId(dashboard.phases[0].id);
    }
  }, [dashboard.phases, phaseId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createDeliverable.mutateAsync({
      ...form,
      acceptance_criteria: form.acceptance_criteria?.trim() || null,
      description: form.description.trim(),
      due_date: form.due_date || null,
    });
    setForm({ acceptance_criteria: null, approver_id: null, description: "", due_date: null, owner_id: null, task_id: "" });
  }

  const tasks = tasksQuery.data ?? [];

  return (
    <div className="space-y-4">
      {canEdit ? (
        <form className="space-y-3 rounded-md border bg-background p-4" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-3 md:grid-cols-2">
            <SetupInput label="Deliverable" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
            <SetupInput label="Due Date" type="date" value={form.due_date ?? ""} onChange={(value) => setForm((current) => ({ ...current, due_date: value || null }))} />
            <Select value={phaseId} onValueChange={(value) => { setPhaseId(value); setForm((current) => ({ ...current, task_id: "" })); }}>
              <SelectTrigger aria-label="Deliverable phase"><SelectValue placeholder="Select phase" /></SelectTrigger>
              <SelectContent>{dashboard.phases.map((phase) => <SelectItem key={phase.id} value={phase.id}>{phase.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.task_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, task_id: value === "none" ? "" : value }))} disabled={!phaseId || tasksQuery.isLoading}>
              <SelectTrigger aria-label="Deliverable task"><SelectValue placeholder="Select task" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select task</SelectItem>
                {tasks.map((task) => <SelectItem key={task.id} value={task.id}>{task.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <MemberSelect label="Owner" members={members} value={form.owner_id} onChange={(value) => setForm((current) => ({ ...current, owner_id: value }))} />
            <MemberSelect label="Approver" members={members} value={form.approver_id} onChange={(value) => setForm((current) => ({ ...current, approver_id: value }))} />
          </div>
          <SetupTextarea label="Acceptance Criteria" value={form.acceptance_criteria ?? ""} onChange={(value) => setForm((current) => ({ ...current, acceptance_criteria: value }))} />
          <Button type="submit" disabled={!form.description.trim() || !form.task_id || createDeliverable.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            Add Deliverable
          </Button>
          {createDeliverable.error ? <p className="text-sm text-error">{userFacingErrorMessage(createDeliverable.error, { action: "deliverable" })}</p> : null}
        </form>
      ) : null}
      {deliverablesQuery.isLoading ? <LoadingState label="Loading deliverables" /> : null}
      {deliverablesQuery.isError ? <ErrorState title="Deliverables could not be loaded" message={userFacingErrorMessage(deliverablesQuery.error, { action: "deliverables" })} /> : null}
      {deliverablesQuery.data?.length === 0 ? <EmptyState title="No deliverables have been added." /> : null}
      <div className="space-y-2">
        {deliverablesQuery.data?.map((deliverable) => (
          <div key={deliverable.id} className="rounded-md border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-foreground">{deliverable.description}</p>
              <StatusBadge value={deliverable.is_completed ? "Completed" : "Not Started"} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{deliverable.phase_name} / {deliverable.task_name}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Owner: {deliverable.owner?.name ?? "Unassigned"} / Due: {formatSetupDate(deliverable.due_date)} / Approver: {deliverable.approver?.name ?? "Unassigned"}
            </p>
            {deliverable.acceptance_criteria ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{deliverable.acceptance_criteria}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Phase0ResourcesSection({ canEdit, projectId }: { canEdit: boolean; projectId: string }) {
  const resourcesQuery = useProjectSetupResourcesQuery(projectId);
  const createResource = useCreateProjectSetupResourceMutation(projectId);
  const [form, setForm] = useState<ProjectSetupResourcePayload>({ name: "", notes: null, resource_type: "People" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createResource.mutateAsync({ ...form, name: form.name.trim(), notes: form.notes?.trim() || null });
    setForm({ name: "", notes: null, resource_type: "People" });
  }

  return (
    <div className="space-y-4">
      {canEdit ? (
        <form className="space-y-3 rounded-md border bg-background p-4" onSubmit={(event) => void onSubmit(event)}>
          <div className="grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)_auto]">
            <Select value={form.resource_type} onValueChange={(value) => setForm((current) => ({ ...current, resource_type: value as ProjectSetupResourceType }))}>
              <SelectTrigger aria-label="Resource type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["People", "Equipment", "Materials", "Facilities", "Technology", "Other"].map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={form.name} placeholder="Resource" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <Button type="submit" disabled={!form.name.trim() || createResource.isPending}>
              <Plus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </div>
          <SetupTextarea label="Notes" value={form.notes ?? ""} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
          {createResource.error ? <p className="text-sm text-error">{userFacingErrorMessage(createResource.error, { action: "resource" })}</p> : null}
        </form>
      ) : null}
      {resourcesQuery.isLoading ? <LoadingState label="Loading resources" /> : null}
      {resourcesQuery.isError ? <ErrorState title="Resources could not be loaded" message={userFacingErrorMessage(resourcesQuery.error, { action: "resources" })} /> : null}
      {resourcesQuery.data?.length === 0 ? <EmptyState title="No resources have been added." /> : null}
      <div className="space-y-2">
        {resourcesQuery.data?.map((resource) => (
          <div key={resource.id} className="rounded-md border bg-background p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{resource.resource_type}</Badge>
              <p className="font-medium text-foreground">{resource.name}</p>
            </div>
            {resource.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{resource.notes}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function MemberSelect({ label, members, onChange, value }: { label: string; members: ProjectMember[]; onChange: (value: string | null) => void; value: string | null }) {
  return (
    <Select value={value ?? "none"} onValueChange={(nextValue) => onChange(nextValue === "none" ? null : nextValue)}>
      <SelectTrigger aria-label={label}><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{label}: unassigned</SelectItem>
        {members.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.name} - {member.role}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Phase0BudgetSection({
  canEdit,
  dashboard,
  projectId,
}: {
  canEdit: boolean;
  dashboard: ProjectDashboard;
  projectId: string;
}) {
  const budgetQuery = useProjectBudgetQuery(projectId);
  const setupBudgetQuery = useProjectSetupBudgetQuery(projectId, canEdit);
  const updateBudget = useUpdateProjectSetupBudgetMutation(projectId);
  const phases = dashboard.phases;
  const [totalBudget, setTotalBudget] = useState("0");
  const [budgetNotes, setBudgetNotes] = useState("");
  const [allocationRows, setAllocationRows] = useState<BudgetAllocationDraft[]>(() => initialBudgetAllocationRows(phases));

  useEffect(() => {
    if (setupBudgetQuery.data) {
      setTotalBudget(String(setupBudgetQuery.data.total_project_budget));
      setBudgetNotes(setupBudgetQuery.data.budget_notes ?? "");
    }
    setAllocationRows(initialBudgetAllocationRows(phases));
  }, [phases, setupBudgetQuery.data]);

  const allocatedToPhases = allocationRows.reduce((sum, row) => sum + (isNonNegativeNumber(row.allocated) ? Number(row.allocated) : 0), 0);
  const totalBudgetNumber = isNonNegativeNumber(totalBudget) ? Number(totalBudget) : 0;
  const unallocated = totalBudgetNumber - allocatedToPhases;
  const selectedPhaseIds = new Set(allocationRows.map((row) => row.phase_id).filter(Boolean));
  const availablePhases = phases.filter((phase) => !selectedPhaseIds.has(phase.id));
  const invalidRows = allocationRows.some((row) => !row.phase_id || !isNonNegativeNumber(row.allocated));
  const hasInvalidBudget = !isNonNegativeNumber(totalBudget) || invalidRows;

  function addAllocationRow() {
    const nextPhase = availablePhases[0];
    if (!nextPhase) {
      return;
    }
    setAllocationRows((current) => [...current, { phase_id: nextPhase.id, allocated: String(nextPhase.budget_allocated) }]);
  }

  function updateAllocationRow(index: number, field: keyof BudgetAllocationDraft, value: string) {
    setAllocationRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  function removeAllocationRow(index: number) {
    setAllocationRows((current) => current.filter((_row, rowIndex) => rowIndex !== index));
  }

  async function onSaveBudget() {
    const payload: ProjectSetupBudgetPayload = {
      total_project_budget: Number(totalBudget),
      budget_notes: budgetNotes.trim() || null,
      phase_allocations: allocationRows.map((row) => ({
        phase_id: row.phase_id,
        allocated: Number(row.allocated),
      })),
    };
    await updateBudget.mutateAsync(payload);
  }

  if (budgetQuery.isLoading || setupBudgetQuery.isLoading) {
    return <LoadingState label="Loading project budget" />;
  }

  if (budgetQuery.isError) {
    return <ErrorState title="Budget could not be loaded" message={userFacingErrorMessage(budgetQuery.error, { action: "project budget" })} />;
  }

  if (setupBudgetQuery.isError) {
    return <ErrorState title="Budget setup could not be loaded" message={userFacingErrorMessage(setupBudgetQuery.error, { action: "budget setup" })} />;
  }

  const liveBudget = budgetQuery.data;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <SetupMetric label="Total Budget" value={formatCurrency(totalBudgetNumber)} />
        <SetupMetric label="Allocated to Phases" value={formatCurrency(allocatedToPhases)} />
        <SetupMetric label="Unallocated" value={formatCurrency(unallocated)} />
      </div>
      {liveBudget ? (
        <p className="text-sm text-muted-foreground">
          Finance utilisation remains live: {formatCurrency(liveBudget.spent)} spent, {formatPercent(liveBudget.utilisation)} utilised.
        </p>
      ) : null}
      <div className="rounded-md border bg-background p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <SetupInput label="Total Project Budget" type="number" value={totalBudget} disabled={!canEdit} onChange={setTotalBudget} />
          <SetupTextarea label="Budget Notes" value={budgetNotes} disabled={!canEdit} onChange={setBudgetNotes} />
        </div>
      </div>
      <div className="rounded-md border bg-background p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Initial Phase Allocations</p>
            <p className="text-sm text-muted-foreground">Rows use existing project phases and save to live phase budget allocations.</p>
          </div>
          {canEdit ? (
            <Button type="button" variant="outline" disabled={availablePhases.length === 0} onClick={addAllocationRow}>
              <Plus className="size-4" aria-hidden="true" />
              Add Phase Allocation
            </Button>
          ) : null}
        </div>
        {phases.length === 0 ? <EmptyState title="Add a phase before assigning phase allocations." /> : null}
        {phases.length > 0 && allocationRows.length === 0 ? <p className="text-sm text-muted-foreground">No phase allocations have been added yet.</p> : null}
        {allocationRows.length > 0 ? (
          <div className="space-y-2">
            {allocationRows.map((row, index) => {
              const phaseOptions = phases.filter((phase) => phase.id === row.phase_id || !selectedPhaseIds.has(phase.id));
              return (
                <div key={`${row.phase_id}-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
                  <Select value={row.phase_id} onValueChange={(value) => updateAllocationRow(index, "phase_id", value)} disabled={!canEdit}>
                    <SelectTrigger aria-label={`Allocation phase ${index + 1}`}>
                      <SelectValue placeholder="Select phase" />
                    </SelectTrigger>
                    <SelectContent>
                      {phaseOptions.map((phase) => (
                        <SelectItem key={phase.id} value={phase.id}>
                          {phase.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.allocated}
                    disabled={!canEdit}
                    onChange={(event) => updateAllocationRow(index, "allocated", event.target.value)}
                    aria-label={`Phase allocation ${index + 1}`}
                  />
                  {canEdit ? (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeAllocationRow(index)} aria-label="Remove phase allocation">
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {hasInvalidBudget ? <p className="text-sm text-error">Budget values must be non-negative numbers and each row must select a phase.</p> : null}
      {updateBudget.error ? <p className="text-sm text-error">{userFacingErrorMessage(updateBudget.error, { action: "budget setup" })}</p> : null}
      {canEdit ? (
        <Button type="button" disabled={hasInvalidBudget || updateBudget.isPending} onClick={() => void onSaveBudget()}>
          <Save className="size-4" aria-hidden="true" />
          {updateBudget.isPending ? "Saving..." : "Save Budget Setup"}
        </Button>
      ) : null}
    </div>
  );
}

type BudgetAllocationDraft = {
  phase_id: string;
  allocated: string;
};

function initialBudgetAllocationRows(phases: DashboardPhase[]): BudgetAllocationDraft[] {
  return phases
    .filter((phase) => phase.budget_allocated > 0)
    .map((phase) => ({
      phase_id: phase.id,
      allocated: String(phase.budget_allocated),
    }));
}

type FirstPassFormProps = {
  canEdit: boolean;
  isSaving: boolean;
  onMarkComplete: () => Promise<void>;
  onSave: (payload: ProjectSetupDetailsPayload) => Promise<void>;
  setup: ProjectSetup;
  statusPending: boolean;
};

function SetupInput({
  disabled,
  label,
  onChange,
  readOnly,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  type?: string;
  value: string;
}) {
  const id = `setup-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} disabled={disabled} readOnly={readOnly} onChange={(event) => onChange?.(event.target.value)} />
    </div>
  );
}

function SetupTextarea({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = `setup-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SetupActions({
  canEdit,
  isSaving,
  onMarkComplete,
  statusPending,
}: {
  canEdit: boolean;
  isSaving: boolean;
  onMarkComplete: () => Promise<void>;
  statusPending: boolean;
}) {
  if (!canEdit) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={isSaving}>
        <Save className="size-4" aria-hidden="true" />
        {isSaving ? "Saving..." : "Save"}
      </Button>
      <Button type="button" variant="outline" disabled={statusPending} onClick={() => void onMarkComplete()}>
        <Check className="size-4" aria-hidden="true" />
        Mark Complete
      </Button>
    </div>
  );
}

async function handleSubmit<TPayload extends ProjectSetupDetailsPayload>(
  event: FormEvent<HTMLFormElement>,
  onSave: (payload: ProjectSetupDetailsPayload) => Promise<void>,
  payload: TPayload,
) {
  event.preventDefault();
  await onSave(payload);
}

function formatSetupDate(value: string | null) {
  if (!value) {
    return "No date";
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, {
    currency: "USD",
    style: "currency",
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

function isNonNegativeNumber(value: string) {
  if (value.trim() === "") {
    return false;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0;
}

function SetupStatusIcon({ status }: { status: ProjectSetupStatus }) {
  if (status === "Complete") {
    return <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />;
  }
  if (status === "In Progress") {
    return <FileClock className="size-4 shrink-0 text-warning" aria-hidden="true" />;
  }
  if (status === "Not Applicable") {
    return <XCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
  return <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function SetupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
