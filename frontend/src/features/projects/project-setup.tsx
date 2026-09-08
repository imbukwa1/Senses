import { CheckCircle2, Circle, ClipboardList, Eye, FileClock, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { userFacingErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

import { useProjectSetupQuery, useUpdateProjectSetupSectionMutation } from "./hooks";
import type { ProjectSetup, ProjectSetupSection, ProjectSetupStatus } from "./types";

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
            {canEdit ? (
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
