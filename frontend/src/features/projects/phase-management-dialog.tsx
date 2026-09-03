import { CheckCircle2, ChevronsUpDown, Edit, Flag, Plus, StepBack, StepForward, Trash2 } from "lucide-react";

import { ConfirmAction } from "@/components/common/confirm-action";
import { EmptyState } from "@/components/common/empty-state";
import { InlineErrorMessage } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { userFacingErrorMessage } from "@/lib/api-errors";

import {
  useArchivePhaseMutation,
  useCompletePhaseMutation,
  useReorderPhasesMutation,
  useSetCurrentPhaseMutation,
} from "./hooks";
import { PhaseFormDialog } from "./phase-form-dialog";
import type { DashboardPhase } from "./types";

type PhaseManagementDialogProps = {
  projectId: string;
  phases: DashboardPhase[];
  currentPhaseId: string | null;
  children: React.ReactNode;
};

export function PhaseManagementDialog({ children, currentPhaseId, phases, projectId }: PhaseManagementDialogProps) {
  const archivePhase = useArchivePhaseMutation(projectId);
  const completePhase = useCompletePhaseMutation(projectId);
  const reorderPhases = useReorderPhasesMutation(projectId);
  const setCurrentPhase = useSetCurrentPhaseMutation(projectId);
  const pending = archivePhase.isPending || completePhase.isPending || reorderPhases.isPending || setCurrentPhase.isPending;
  const mutationError = archivePhase.error ?? completePhase.error ?? reorderPhases.error ?? setCurrentPhase.error;
  const sortedPhases = [...phases].sort((a, b) => a.display_order - b.display_order);
  const nextDisplayOrder = sortedPhases.length + 1;

  function movePhase(phaseId: string, direction: "up" | "down") {
    const index = sortedPhases.findIndex((phase) => phase.id === phaseId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (index < 0 || targetIndex < 0 || targetIndex >= sortedPhases.length) {
      return;
    }

    const nextOrder = sortedPhases.map((phase) => phase.id);
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
    reorderPhases.mutate(nextOrder);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Manage Phases</DialogTitle>
          <DialogDescription>
            Create, edit, reorder, archive, and set dashboard focus. Phase status and Current Phase are separate.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{sortedPhases.length} phase{sortedPhases.length === 1 ? "" : "s"}</p>
            <PhaseFormDialog mode="create" projectId={projectId} nextDisplayOrder={nextDisplayOrder}>
              <Button type="button" className="bg-brand-red text-white hover:bg-brand-red/90">
                <Plus className="size-4" aria-hidden="true" />
                Add Phase
              </Button>
            </PhaseFormDialog>
          </div>
          {mutationError ? <InlineErrorMessage message={phaseActionErrorMessage(mutationError)} /> : null}
          {sortedPhases.length === 0 ? (
            <EmptyState title="No phases have been added yet." description="Create the first phase when the project is ready for phase planning." />
          ) : (
            <div className="divide-y rounded-md border bg-surface">
              {sortedPhases.map((phase, index) => (
                <div key={phase.id} className="grid gap-3 px-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-foreground">{phase.name}</h3>
                      <StatusBadge value={phase.status} />
                      {phase.id === currentPhaseId ? <Badge variant="outline">Current Phase</Badge> : null}
                    </div>
                    {phase.description ? <p className="mt-2 text-sm text-muted-foreground">{phase.description}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Owner: {phase.owner_id ?? "No owner"} - {formatOptionalDate(phase.start_date)} - {formatOptionalDate(phase.end_date)}
                    </p>
                    <div className="mt-3 max-w-xs">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">Backend progress</span>
                        <span className="font-medium text-foreground">{Math.round(phase.progress)}%</span>
                      </div>
                      <Progress value={phase.progress} aria-label={`${phase.name} backend progress ${Math.round(phase.progress)}%`} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 lg:justify-end">
                    <Button type="button" variant="ghost" size="icon" disabled={pending || index === 0} onClick={() => movePhase(phase.id, "up")} aria-label={`Move ${phase.name} up`}>
                      <StepBack className="size-4 rotate-90" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={pending || index === sortedPhases.length - 1}
                      onClick={() => movePhase(phase.id, "down")}
                      aria-label={`Move ${phase.name} down`}
                    >
                      <StepForward className="size-4 rotate-90" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending || phase.id === currentPhaseId}
                      onClick={() => setCurrentPhase.mutate(phase.id)}
                    >
                      <Flag className="size-4" aria-hidden="true" />
                      Current
                    </Button>
                    <PhaseFormDialog mode="edit" projectId={projectId} phase={phase} nextDisplayOrder={nextDisplayOrder}>
                      <Button type="button" variant="ghost" size="sm">
                        <Edit className="size-4" aria-hidden="true" />
                        Edit
                      </Button>
                    </PhaseFormDialog>
                    <Button type="button" variant="ghost" size="sm" disabled={pending || phase.status === "Completed"} onClick={() => completePhase.mutate(phase.id)}>
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Complete
                    </Button>
                    <ConfirmAction
                      title="Archive phase?"
                      description="This uses the backend's history-preserving archive behaviour. It does not hard-delete the phase from React."
                      confirmLabel="Archive Phase"
                      onConfirm={() => archivePhase.mutate(phase.id)}
                    >
                      <Button type="button" variant="ghost" size="sm" disabled={pending}>
                        <Trash2 className="size-4" aria-hidden="true" />
                        Archive
                      </Button>
                    </ConfirmAction>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function phaseActionErrorMessage(error: Error) {
  return userFacingErrorMessage(error, {
    action: "the phase request",
    conflict: "The phase change conflicts with existing data.",
    forbidden: "You do not have access to manage phases for this project.",
    notFound: "The project or phase could not be found.",
  });
}

function formatOptionalDate(value: string | null) {
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
