import { AlertCircle } from "lucide-react";

export function InlineErrorMessage({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-error">
      <AlertCircle className="size-4" aria-hidden="true" />
      {message}
    </p>
  );
}

export function ErrorState({ title = "Something went wrong", message }: { title?: string; message: string }) {
  return (
    <div className="rounded-md border border-error/20 bg-surface p-5">
      <h3 className="text-sm font-semibold text-error">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
