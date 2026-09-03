import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function LoadingSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-primary", className)} aria-hidden="true" />;
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-2 rounded-md border bg-surface p-6 text-sm text-muted-foreground">
      <LoadingSpinner />
      <span>{label}</span>
    </div>
  );
}
