import { StatusBadge } from "@/components/common/status-badge";
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

import type { DashboardPhase, Task } from "./types";

export function TaskSummaryDialog({ children, phase, task }: { children: React.ReactNode; phase: DashboardPhase; task: Task }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task.name}</DialogTitle>
          <DialogDescription>Basic task information. Detailed task collaboration belongs to a later section.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 rounded-md border bg-background p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Phase</dt>
            <dd className="font-medium text-foreground">{phase.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Owner</dt>
            <dd className="font-medium text-foreground">{task.owner_id}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Priority</dt>
            <dd>
              <StatusBadge value={task.priority} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <StatusBadge value={task.status} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Dates</dt>
            <dd className="font-medium text-foreground">
              {formatOptionalDate(task.start_date)} - {formatOptionalDate(task.due_date)}
            </dd>
          </div>
          {task.description ? (
            <div>
              <dt className="text-muted-foreground">Description</dt>
              <dd className="mt-1 text-foreground">{task.description}</dd>
            </div>
          ) : null}
        </dl>
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
