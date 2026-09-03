import type * as React from "react";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FormFieldProps = {
  label: string;
  error?: string;
  description?: string;
  required?: boolean;
  children: (fieldIds: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
  className?: string;
};

export function FormField({ label, error, description, required, children, className }: FormFieldProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-error" aria-hidden="true">*</span> : null}
      </Label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {description ? (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
