import { Check, CheckCircle2, Circle, ClipboardList, Eye, FileClock, Save, XCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
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

import { useProjectSetupQuery, useUpdateProjectSetupDetailsMutation, useUpdateProjectSetupSectionMutation } from "./hooks";
import type { ProjectSetup, ProjectSetupDetailsPayload, ProjectSetupDetailsSection, ProjectSetupSection, ProjectSetupStatus } from "./types";

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

export function ProjectSetupPanel({ canEdit, projectId }: { projectId: string; canEdit: boolean }) {
  const setupQuery = useProjectSetupQuery(projectId);
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
  isSaving,
  onMarkComplete,
  onSaveDetails,
  setup,
  statusPending,
}: {
  activeSection: ProjectSetupSection;
  canEdit: boolean;
  isSaving: boolean;
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
