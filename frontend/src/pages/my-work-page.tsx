import { ArrowRight, CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";

import { ErrorState } from "@/components/common/error-state";
import { PageTable } from "@/components/common/page-table";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMyWorkQuery } from "@/features/projects/hooks";
import type { MyWorkItem } from "@/features/projects/types";
import { userFacingErrorMessage } from "@/lib/api-errors";

export function MyWorkPage() {
  const myWorkQuery = useMyWorkQuery();
  const items = myWorkQuery.data ?? [];

  if (myWorkQuery.isError) {
    return <ErrorState title="My Work could not be loaded" message={userFacingErrorMessage(myWorkQuery.error)} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border bg-surface">
          <CalendarClock className="size-5 text-info" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">My Work</h2>
          <p className="text-sm text-muted-foreground">{items.length} assigned task{items.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <PageTable
        isLoading={myWorkQuery.isLoading}
        isEmpty={items.length === 0}
        emptyTitle="No assigned work found."
        emptyDescription="Tasks appear here when you own them or support them."
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead scope="col">Task</TableHead>
              <TableHead scope="col">Project</TableHead>
              <TableHead scope="col">Phase</TableHead>
              <TableHead scope="col">Due</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Action</TableHead>
              <TableHead scope="col" className="text-right">
                Open
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <MyWorkRow key={item.task_id} item={item} />
            ))}
          </TableBody>
        </Table>
      </PageTable>
    </section>
  );
}

function MyWorkRow({ item }: { item: MyWorkItem }) {
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-foreground">{item.task_name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{relationshipLabel(item.relationship)}</p>
      </TableCell>
      <TableCell>
        <p className="text-sm font-medium text-foreground">{item.project_name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.project_code}</p>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{item.phase_name}</TableCell>
      <TableCell>
        <span className={item.overdue ? "text-sm font-medium text-error" : "text-sm text-muted-foreground"}>{formatOptionalDate(item.due_date)}</span>
      </TableCell>
      <TableCell>
        <StatusBadge value={item.status} />
      </TableCell>
      <TableCell>{item.action_label ? <Badge variant={item.overdue ? "error" : "outline"}>{item.action_label}</Badge> : null}</TableCell>
      <TableCell className="text-right">
        <Button asChild type="button" variant="ghost" size="sm">
          <Link to={`/projects/${item.project_id}?phase=${item.phase_id}&task=${item.task_id}`}>
            <ArrowRight className="size-4" aria-hidden="true" />
            Open
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

function relationshipLabel(value: MyWorkItem["relationship"]) {
  if (value === "owner_supporter") {
    return "Owner and supporter";
  }

  return value === "owner" ? "Owner" : "Supporter";
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
