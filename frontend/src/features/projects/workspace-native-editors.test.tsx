import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceDocumentEditor, WorkspaceSpreadsheetEditor } from "./workspace-native-editors";

const mocks = vi.hoisted(() => ({
  documentJson: { type: "doc", content: [{ type: "paragraph" }] } as Record<string, unknown>,
  rename: vi.fn(),
  saveContent: vi.fn(),
  setContent: vi.fn(),
  workspaceResource: {
    id: "88888888-8888-4888-8888-888888888888",
    project_id: "11111111-1111-4111-8111-111111111111",
    folder_id: null,
    task_id: null,
    name: "Interview Notes",
    content: { type: "doc", content: [{ type: "paragraph" }] } as Record<string, unknown>,
    created_by: "33333333-3333-4333-8333-333333333333",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
}));

const fakeEditor = {
  chain: () => ({
    focus: () => ({
      toggleBold: () => ({ run: vi.fn() }),
      toggleBulletList: () => ({ run: vi.fn() }),
      toggleHeading: () => ({ run: vi.fn() }),
      toggleItalic: () => ({ run: vi.fn() }),
      toggleOrderedList: () => ({ run: vi.fn() }),
    }),
  }),
  commands: {
    setContent: mocks.setContent,
  },
  getJSON: () => mocks.documentJson,
  isActive: () => false,
};

let latestEditorOptions: { onUpdate?: (payload: { editor: typeof fakeEditor }) => void } = {};

vi.mock("@tiptap/react", () => ({
  EditorContent: () => (
    <textarea
      aria-label="Document editor"
      onChange={(event) => {
        mocks.documentJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: event.currentTarget.value }] }] };
        latestEditorOptions.onUpdate?.({ editor: fakeEditor });
      }}
    />
  ),
  useEditor: (options: typeof latestEditorOptions) => {
    latestEditorOptions = options;
    return fakeEditor;
  },
}));

vi.mock("@tiptap/starter-kit", () => ({
  default: {},
}));

vi.mock("@univerjs/presets", () => ({
  createUniver: () => ({
    univer: {
      createUnit: vi.fn(),
      dispose: vi.fn(),
    },
    univerAPI: {
      onCommandExecuted: vi.fn(),
    },
  }),
  UniverInstanceType: {
    UNIVER_SHEET: 2,
  },
}));

vi.mock("@univerjs/preset-sheets-core", () => ({
  UniverSheetsCorePreset: vi.fn(() => ({ plugins: [] })),
}));

vi.mock("./hooks", () => ({
  useRenameWorkspaceNativeResourceMutation: () => ({ isPending: false, mutateAsync: mocks.rename }),
  useUpdateWorkspaceNativeResourceContentMutation: () => ({ isPending: false, mutateAsync: mocks.saveContent }),
  useWorkspaceNativeResourceQuery: () => ({
    data: mocks.workspaceResource,
    error: null,
    isError: false,
    isLoading: false,
  }),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const resourceId = "88888888-8888-4888-8888-888888888888";

describe("workspace native editors", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.documentJson = { type: "doc", content: [{ type: "paragraph" }] };
    mocks.workspaceResource = {
      ...mocks.workspaceResource,
      name: "Interview Notes",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    };
    mocks.rename.mockResolvedValue(mocks.workspaceResource);
    mocks.saveContent.mockResolvedValue(mocks.workspaceResource);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads, renames, and autosaves a document", async () => {
    render(<WorkspaceDocumentEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);

    expect(screen.getByText("Interview Notes")).toBeInTheDocument();
    expect(mocks.setContent).toHaveBeenCalledWith({ type: "doc", content: [{ type: "paragraph" }] }, { emitUpdate: false });

    fireEvent.change(screen.getByLabelText("Document Name"), { target: { value: "Renamed Notes" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save Name" }));
    });
    expect(mocks.rename).toHaveBeenCalledWith({ resourceId, payload: { name: "Renamed Notes" } });

    fireEvent.change(screen.getByLabelText("Document editor"), { target: { value: "Saved body" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(mocks.saveContent).toHaveBeenCalledWith({
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Saved body" }] }] },
    });
  });

  it("autosaves spreadsheet fallback content when the sheet runtime cannot mount", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    mocks.workspaceResource = {
      ...mocks.workspaceResource,
      name: "Participant Tracker",
      content: { id: "workbook", sheetOrder: [], sheets: {} },
    };

    render(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);

    const editor = screen.getByLabelText("Spreadsheet JSON editor");
    fireEvent.change(editor, { target: { value: JSON.stringify({ id: "workbook", sheets: { Sheet1: {} } }) } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(mocks.saveContent).toHaveBeenCalledWith({ content: { id: "workbook", sheets: { Sheet1: {} } } });
  });

  it("surfaces malformed spreadsheet fallback content without saving", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    mocks.workspaceResource = {
      ...mocks.workspaceResource,
      name: "Participant Tracker",
      content: { id: "workbook", sheetOrder: [], sheets: {} },
    };

    render(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Spreadsheet JSON editor"), { target: { value: "{" } });

    expect(screen.getByText("Spreadsheet JSON is malformed.")).toBeInTheDocument();
    expect(mocks.saveContent).not.toHaveBeenCalled();
  });
});
