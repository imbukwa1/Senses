import { Eye } from "lucide-react";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { DownloadedTaskFile } from "./types";

type PreviewKind = "pdf" | "image" | "text" | "xlsx" | "unsupported";
type XlsxPreview = { sheets: Array<{ name: string; rows: string[][] }>; activeSheet: number };

export function FilePreviewDialog({ disabled, fileName, fileType, loadFile }: { disabled?: boolean; fileName: string; fileType: string | null; loadFile: () => Promise<DownloadedTaskFile> }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ kind: "pdf" | "image" | "text"; value: string } | { kind: "xlsx"; value: XlsxPreview } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = getPreviewKind(fileName, fileType);

  useEffect(() => () => {
    if (preview && (preview.kind === "pdf" || preview.kind === "image") && preview.value) URL.revokeObjectURL(preview.value);
  }, [preview]);

  async function openPreview() {
    setOpen(true);
    setError(null);
    setPreview(null);
    if (kind === "unsupported") return;
    setLoading(true);
    try {
      const downloaded = await loadFile();
      if (kind === "xlsx") {
        const workbook = XLSX.read(await downloaded.blob.arrayBuffer(), { type: "array", cellDates: true });
        const sheets = workbook.SheetNames.map((name) => ({
          name,
          rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "", blankrows: false }).map((row) => (row as unknown[]).map((cell) => String(cell ?? ""))),
        }));
        setPreview({ kind, value: { sheets, activeSheet: 0 } });
      } else {
        setPreview(kind === "text" ? { kind, value: await downloaded.blob.text() } : { kind, value: URL.createObjectURL(downloaded.blob) });
      }
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
        {preview?.kind === "xlsx" ? <XlsxPreviewPanel preview={preview.value} onSelectSheet={(activeSheet) => setPreview({ kind: "xlsx", value: { ...preview.value, activeSheet } })} /> : null}
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
  if (normalizedType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || extension === "xlsx") return "xlsx";
  return "unsupported";
}

function XlsxPreviewPanel({ preview, onSelectSheet }: { preview: XlsxPreview; onSelectSheet: (index: number) => void }) {
  const sheet = preview.sheets[preview.activeSheet];

  if (!sheet) {
    return <p className="py-8 text-center text-sm text-muted-foreground">This workbook does not contain a readable sheet. Use Download to open it.</p>;
  }

  return (
    <div className="space-y-3">
      {preview.sheets.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Workbook sheets">
          {preview.sheets.map((item, index) => (
            <Button key={item.name} type="button" size="sm" variant={index === preview.activeSheet ? "default" : "outline"} role="tab" aria-selected={index === preview.activeSheet} onClick={() => onSelectSheet(index)}>
              {item.name}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="max-h-[70vh] overflow-auto rounded-md border">
        <table className="min-w-full border-collapse text-left text-sm" aria-label={`Read-only preview of ${sheet.name}`}>
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b last:border-b-0">
                {row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-pre-wrap border-r px-3 py-2 align-top last:border-r-0">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
