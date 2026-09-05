import { Edit, Plus } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { userFacingErrorMessage } from "@/lib/api-errors";

import { useTasksQuery } from "./hooks";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskDetailDrawer } from "./task-detail-drawer";
import type { DashboardPhase, Task } from "./types";

export function PhaseTasks({ isProjectPm, phase, projectId }: { isProjectPm: boolean; projectId: string; phase: DashboardPhase }) {
  const tasksQuery = useTasksQuery(projectId, phase.id);
  const tasks = tasksQuery.data ?? [];

  return (
    <div className="mt-4 rounded-md border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3">
        <h4 className="text-sm font-semibold text-foreground">Tasks</h4>
        {isProjectPm ? (
          <TaskFormDialog mode="create" projectId={projectId} phase={phase}>
            <Button type="button" variant="outline" size="sm">
              <Plus className="size-4" aria-hidden="true" />
              Add Task
            </Button>
          </TaskFormDialog>
        ) : null}
      </div>
      <div className="p-3">
        {tasksQuery.isLoading ? <LoadingState label="Loading tasks" /> : null}
        {tasksQuery.isError ? <ErrorState title="Tasks could not be loaded" message={taskErrorMessage(tasksQuery.error)} /> : null}
        {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length === 0 ? (
          <EmptyState title="No tasks have been added to this phase." />
        ) : null}
        {!tasksQuery.isLoading && !tasksQuery.isError && tasks.length > 0 ? (
          <TaskTable isProjectPm={isProjectPm} projectId={projectId} phase={phase} tasks={tasks} />
        ) : null}
      </div>
    </div>
  );
}

function TaskTable({ isProjectPm, phase, projectId, tasks }: { isProjectPm: boolean; projectId: string; phase: DashboardPhase; tasks: Task[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead scope="col">Task</TableHead>
          <TableHead scope="col">Owner</TableHead>
          <TableHead scope="col">Priority</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col">Dates</TableHead>
          <TableHead scope="col" className="text-right">
            Action
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>
              <p className="font-medium text-foreground">{task.name}</p>
              {task.description ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p> : null}
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{task.owner.name}</TableCell>
            <TableCell>
              <StatusBadge value={task.priority} />
            </TableCell>
            <TableCell>
              <StatusBadge value={task.status} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
              {formatOptionalDate(task.start_date)} - {formatOptionalDate(task.due_date)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <TaskDetailDrawer isProjectPm={isProjectPm} phase={phase} projectId={projectId} task={task}>
                  <Button type="button" variant="ghost" size="sm">
                    View
                  </Button>
                </TaskDetailDrawer>
                {isProjectPm ? (
                  <TaskFormDialog mode="edit" projectId={projectId} phase={phase} task={task}>
                    <Button type="button" variant="ghost" size="sm">
                      <Edit className="size-4" aria-hidden="true" />
                      Edit
                    </Button>
                  </TaskFormDialog>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function taskErrorMessage(error: Error | null) {
  return userFacingErrorMessage(error, {
    forbidden: "You do not have access to tasks for this phase.",
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
