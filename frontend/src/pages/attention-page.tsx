import { AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { ErrorState } from "@/components/common/error-state";
import { PageTable } from "@/components/common/page-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAttentionQuery } from "@/features/projects/hooks";
import type { AttentionItem } from "@/features/projects/types";
import { userFacingErrorMessage } from "@/lib/api-errors";

export function AttentionPage() {
  const attentionQuery = useAttentionQuery();
  const items = attentionQuery.data ?? [];

  if (attentionQuery.isError) {
    return <ErrorState title="Attention could not be loaded" message={userFacingErrorMessage(attentionQuery.error)} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border bg-surface">
          <AlertTriangle className="size-5 text-warning" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Attention</h2>
          <p className="text-sm text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"} needing review</p>
        </div>
      </div>

      <PageTable
        isLoading={attentionQuery.isLoading}
        isEmpty={items.length === 0}
        emptyTitle="Nothing needs attention right now."
        emptyDescription="Overdue work, blocked tasks, delayed phases, and at-risk projects will appear here."
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead scope="col">Reason</TableHead>
              <TableHead scope="col">Project</TableHead>
              <TableHead scope="col">Context</TableHead>
              <TableHead scope="col">Due</TableHead>
              <TableHead scope="col">Owner</TableHead>
              <TableHead scope="col">Severity</TableHead>
              <TableHead scope="col" className="text-right">
                Open
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <AttentionRow key={`${item.type}-${item.task_id ?? item.phase_id ?? item.project_id}`} item={item} />
            ))}
          </TableBody>
        </Table>
      </PageTable>
    </section>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-foreground">{item.reason}</p>
        <p className="mt-1 text-xs text-muted-foreground">{typeLabel(item.type)}</p>
      </TableCell>
      <TableCell>
        <p className="text-sm font-medium text-foreground">{item.project_name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{item.project_code}</p>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{contextLabel(item)}</TableCell>
      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatOptionalDate(item.due_date)}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{item.assigned_person?.name ?? "-"}</TableCell>
      <TableCell>
        <Badge variant={item.severity === "Needs attention" ? "error" : "warning"}>{item.severity}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <Button asChild type="button" variant="ghost" size="sm">
          <Link to={attentionHref(item)}>
            <ArrowRight className="size-4" aria-hidden="true" />
            Open
          </Link>
        </Button>
      </TableCell>
    </TableRow>
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

function contextLabel(item: AttentionItem) {
  if (item.task_name && item.phase_name) {
    return `${item.phase_name} / ${item.task_name}`;
  }
  if (item.phase_name) {
    return item.phase_name;
  }
  return "Project";
}

function typeLabel(value: AttentionItem["type"]) {
  if (value === "project") {
    return "Project";
  }
  return value === "phase" ? "Phase" : "Task";
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "-";
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
