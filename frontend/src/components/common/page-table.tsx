import type * as React from "react";

import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";

export function PageTable({
  children,
  isLoading,
  isEmpty,
  emptyTitle = "No records found",
  emptyDescription,
}: {
  children: React.ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (isLoading) {
    return <LoadingState label="Loading records" />;
  }

  if (isEmpty) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return <div className="rounded-md border bg-surface shadow-soft">{children}</div>;
}
