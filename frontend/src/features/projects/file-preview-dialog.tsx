import { Eye } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { DownloadedTaskFile } from "./types";

type PreviewKind = "pdf" | "image" | "text" | "unsupported";

export function FilePreviewDialog({ disabled, fileName, fileType, loadFile }: { disabled?: boolean; fileName: string; fileType: string | null; loadFile: () => Promise<DownloadedTaskFile> }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ kind: Exclude<PreviewKind, "unsupported">; value: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = getPreviewKind(fileName, fileType);

  useEffect(() => () => {
    if (preview?.kind !== "text" && preview?.value) URL.revokeObjectURL(preview.value);
  }, [preview]);

  async function openPreview() {
    setOpen(true);
    setError(null);
    setPreview(null);
    if (kind === "unsupported") return;
    setLoading(true);
    try {
      const downloaded = await loadFile();
      setPreview(kind === "text" ? { kind, value: await downloaded.blob.text() } : { kind, value: URL.createObjectURL(downloaded.blob) });
    } catch {
      setError("Preview could not be loaded. You can still use Download.");
    } finally {
      setLoading(false);
    }
  }

  function closePreview(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setPreview(null);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={closePreview}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void openPreview()} aria-label={`View ${fileName}`}>
          <Eye className="size-4" aria-hidden="true" />
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{fileName}</DialogTitle>
          <DialogDescription>File preview</DialogDescription>
        </DialogHeader>
        {kind === "unsupported" ? <p className="py-8 text-center text-sm text-muted-foreground">Preview not available for this file type. Use Download to open it.</p> : null}
        {loading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading preview...</p> : null}
        {error ? <p className="py-8 text-center text-sm text-error">{error}</p> : null}
        {preview?.kind === "pdf" ? <iframe className="h-[70vh] w-full rounded-md border" title={`Preview of ${fileName}`} src={preview.value} /> : null}
        {preview?.kind === "image" ? <img className="max-h-[70vh] w-full object-contain" alt={`Preview of ${fileName}`} src={preview.value} /> : null}
        {preview?.kind === "text" ? <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border bg-background p-4 text-sm text-foreground">{preview.value}</pre> : null}
      </DialogContent>
    </Dialog>
  );
}

function getPreviewKind(fileName: string, fileType: string | null): PreviewKind {
  const normalizedType = fileType?.toLowerCase() ?? "";
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (normalizedType === "application/pdf" || extension === "pdf") return "pdf";
  if (normalizedType.startsWith("image/")) return "image";
  if (normalizedType.startsWith("text/") || normalizedType === "application/csv" || extension === "csv" || extension === "txt") return "text";
  return "unsupported";
}
