import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

import { FilePreviewDialog } from "./file-preview-dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function xlsxFile() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Name", "Status"], ["Alpha", "Ready"]]), "Overview");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Value"], [42]]), "Details");
  return new Blob([XLSX.write(workbook, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("FilePreviewDialog XLSX preview", () => {
  it("renders multiple sheets as a read-only preview without downloading", async () => {
    const user = userEvent.setup();
    const loadFile = vi.fn().mockResolvedValue({ blob: xlsxFile(), fileName: "report.xlsx" });

    render(<FilePreviewDialog fileName="report.xlsx" fileType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" loadFile={loadFile} />);
    await user.click(screen.getByRole("button", { name: "View report.xlsx" }));

    expect(loadFile).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("table", { name: "Read-only preview of Overview" })).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Details" }));
    await waitFor(() => expect(screen.getByRole("table", { name: "Read-only preview of Details" })).toBeInTheDocument());
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("keeps unsupported files on the existing fallback without fetching", async () => {
    const user = userEvent.setup();
    const loadFile = vi.fn();

    render(<FilePreviewDialog fileName="archive.zip" fileType="application/zip" loadFile={loadFile} />);
    await user.click(screen.getByRole("button", { name: "View archive.zip" }));

    expect(screen.getByText("Preview not available for this file type. Use Download to open it.")).toBeInTheDocument();
    expect(loadFile).not.toHaveBeenCalled();
  });
});
