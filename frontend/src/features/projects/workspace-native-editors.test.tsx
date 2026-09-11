import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceDocumentEditor, WorkspaceSpreadsheetEditor } from "./workspace-native-editors";

const mocks = vi.hoisted(() => ({
  documentJson: { type: "doc", content: [{ type: "paragraph" }] } as Record<string, unknown>,
  rename: vi.fn(),
  saveContent: vi.fn(),
  setContent: vi.fn(),
  authToken: null as string | null,
  collaborationSession: null as Record<string, unknown> | null,
  collaborationLoading: false,
  collaborationError: null as Error | null,
  spreadsheetCollaborationSession: null as Record<string, unknown> | null,
  spreadsheetCollaborationLoading: false,
  spreadsheetCollaborationError: null as Error | null,
  providerEvents: {} as Record<string, (payload?: unknown) => void>,
  providerDestroy: vi.fn(),
  univerCreate: vi.fn(),
  univerLoad: vi.fn(),
  univerDispose: vi.fn(),
  univerAddEvent: vi.fn(),
  univerStatusEvents: {} as Record<string, (payload: { unitId: string; status: string }) => void>,
  univerStatusDispose: vi.fn(),
  editorAvailable: true,
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
  isDestroyed: false,
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
    return mocks.editorAvailable ? fakeEditor : null;
  },
}));

vi.mock("@tiptap/starter-kit", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-collaboration", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@tiptap/extension-collaboration-caret", () => ({
  default: { configure: vi.fn(() => ({})) },
}));

vi.mock("@hocuspocus/provider", () => ({
  HocuspocusProvider: vi.fn(function (this: Record<string, unknown>) {
    this.on = (event: string, callback: (payload?: unknown) => void) => {
      mocks.providerEvents[event] = callback;
    };
    this.off = vi.fn();
    this.destroy = mocks.providerDestroy;
  }),
  WebSocketStatus: { Connected: "connected", Disconnected: "disconnected", Connecting: "connecting" },
}));

vi.mock("@/features/auth/hooks", () => ({
  useAuth: () => ({ token: mocks.authToken, user: mocks.authToken ? { name: "Grace Wanjiku" } : null }),
}));

vi.mock("@univerjs/presets", () => ({
  createUniver: mocks.univerCreate,
  defaultTheme: {},
  LocaleType: { EN_US: "en-US" },
  mergeLocales: vi.fn((...locales: Record<string, unknown>[]) => Object.assign({}, ...locales)),
  UniverInstanceType: {
    UNIVER_SHEET: 2,
  },
}));

vi.mock("@univerjs/preset-sheets-core", () => ({
  UniverSheetsCorePreset: vi.fn(() => ({ plugins: [] })),
}));

vi.mock("@univerjs/preset-sheets-advanced", () => ({
  UniverSheetsAdvancedPreset: vi.fn(() => ({ plugins: [] })),
}));

vi.mock("@univerjs/preset-sheets-collaboration", () => ({
  UniverSheetsCollaborationPreset: vi.fn(() => ({ plugins: [] })),
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
  useDocumentCollaborationSessionQuery: () => ({
    data: mocks.collaborationSession,
    error: mocks.collaborationError,
    isLoading: mocks.collaborationLoading,
  }),
  useSpreadsheetCollaborationSessionQuery: () => ({
    data: mocks.spreadsheetCollaborationSession,
    error: mocks.spreadsheetCollaborationError,
    isLoading: mocks.spreadsheetCollaborationLoading,
  }),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const resourceId = "88888888-8888-4888-8888-888888888888";

describe("workspace native editors", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.documentJson = { type: "doc", content: [{ type: "paragraph" }] };
    fakeEditor.isDestroyed = false;
    mocks.authToken = null;
    mocks.editorAvailable = true;
    mocks.collaborationSession = null;
    mocks.collaborationLoading = false;
    mocks.collaborationError = null;
    mocks.spreadsheetCollaborationSession = null;
    mocks.spreadsheetCollaborationLoading = false;
    mocks.spreadsheetCollaborationError = null;
    mocks.providerEvents = {};
    mocks.providerDestroy.mockReset();
    mocks.workspaceResource = {
      ...mocks.workspaceResource,
      name: "Interview Notes",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    };
    mocks.rename.mockResolvedValue(mocks.workspaceResource);
    mocks.saveContent.mockResolvedValue(mocks.workspaceResource);
    mocks.univerCreate.mockReset();
    mocks.univerLoad.mockReset();
    mocks.univerDispose.mockReset();
    mocks.univerAddEvent.mockReset();
    mocks.univerStatusEvents = {};
    mocks.univerStatusDispose.mockReset();
    mocks.univerAddEvent.mockImplementation((event: string, callback: (payload: { unitId: string; status: string }) => void) => {
      mocks.univerStatusEvents[event] = callback;
      return { dispose: mocks.univerStatusDispose };
    });
    mocks.univerCreate.mockImplementation(() => ({
      univer: { createUnit: vi.fn(), dispose: mocks.univerDispose },
      univerAPI: {
        loadServerUnit: mocks.univerLoad,
        onCommandExecuted: vi.fn(),
        Event: { CollaborationStatusChanged: "CollaborationStatusChanged" },
        addEvent: mocks.univerAddEvent,
      },
    }));
    mocks.univerLoad.mockResolvedValue({ id: "unit-1" });
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

  it("uses the project document room and disables JSON autosave in collaborative mode", async () => {
    mocks.authToken = "senses-bearer-token";
    mocks.collaborationSession = {
      resource_type: "document",
      project_id: projectId,
      resource_id: resourceId,
      room: `project:${projectId}:documents:${resourceId}`,
      endpoint: "ws://127.0.0.1:1234/documents",
      ready: true,
      service: { configured: true, reachable: true, required: [], url: null, detail: null },
    };

    render(<WorkspaceDocumentEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);

    expect(mocks.providerEvents.synced).toBeDefined();
    await act(async () => {
      mocks.providerEvents.synced?.({ state: true });
    });
    fireEvent.change(screen.getByLabelText("Document editor"), { target: { value: "Collaborative body" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    expect(mocks.saveContent).not.toHaveBeenCalled();
    expect(mocks.providerDestroy).not.toHaveBeenCalled();
    cleanup();
    expect(mocks.providerDestroy).toHaveBeenCalledTimes(1);
  });

  it("does not access commands when Tiptap has no live editor", () => {
    mocks.editorAvailable = false;

    expect(() => render(<WorkspaceDocumentEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />)).not.toThrow();
  });

  it("keeps the document fallback usable when collaboration provisioning returns 503", () => {
    mocks.collaborationError = new Error("503 Service Unavailable");

    expect(() => render(<WorkspaceDocumentEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />)).not.toThrow();
    expect(screen.getByLabelText("Document editor")).toBeInTheDocument();
  });

  it("does not call commands after the editor is disposed", async () => {
    mocks.authToken = "senses-bearer-token";
    mocks.collaborationSession = {
      resource_type: "document",
      project_id: projectId,
      resource_id: resourceId,
      room: `project:${projectId}:documents:${resourceId}`,
      endpoint: "ws://127.0.0.1:1234/documents",
      ready: true,
      service: { configured: true, reachable: true, required: [], url: null, detail: null },
    };

    render(<WorkspaceDocumentEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);
    await act(async () => {
      mocks.providerEvents.synced?.({ state: true });
    });
    mocks.setContent.mockClear();
    fakeEditor.isDestroyed = true;
    await act(async () => {
      mocks.providerEvents.synced?.({ state: true });
    });

    expect(mocks.setContent).not.toHaveBeenCalled();
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

  it("loads the provisioned official unit and disables workbook JSON autosave", async () => {
    vi.stubGlobal("ResizeObserver", class ResizeObserver {});
    mocks.workspaceResource = {
      ...mocks.workspaceResource,
      name: "Collaborative Tracker",
      content: { id: "fallback-workbook", sheetOrder: [], sheets: {} },
    };
    mocks.spreadsheetCollaborationSession = {
      resource_type: "spreadsheet",
      project_id: projectId,
      resource_id: resourceId,
      room: `project:${projectId}:spreadsheets:${resourceId}`,
      endpoint: "http://127.0.0.1:8000",
      unit_id: "official-unit-123",
      ready: true,
      service: { configured: true, reachable: true, required: [], url: null, detail: null },
    };

    render(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(mocks.univerCreate).toHaveBeenCalledWith(
      expect.objectContaining({ collaboration: true, presets: expect.any(Array) }),
    );
    expect(mocks.univerLoad).toHaveBeenCalledWith("official-unit-123", 2);
    expect(mocks.saveContent).not.toHaveBeenCalled();
    await act(async () => {
      mocks.univerStatusEvents.CollaborationStatusChanged?.({ unitId: "official-unit-123", status: "offline" });
    });
    expect(screen.getByText("Offline")).toBeInTheDocument();
    await act(async () => {
      mocks.univerStatusEvents.CollaborationStatusChanged?.({ unitId: "official-unit-123", status: "synced" });
    });
    expect(screen.getByText("Reconnected")).toBeInTheDocument();
    cleanup();
    expect(mocks.univerDispose).toHaveBeenCalledTimes(1);
    expect(mocks.univerStatusDispose).toHaveBeenCalledTimes(1);
  });

  it("waits for collaboration provisioning before creating a workbook", async () => {
    vi.stubGlobal("ResizeObserver", class ResizeObserver {});
    mocks.workspaceResource = {
      ...mocks.workspaceResource,
      name: "Provisioning Tracker",
      content: { id: "fallback-workbook", sheetOrder: [], sheets: {} },
    };
    mocks.spreadsheetCollaborationLoading = true;

    const view = render(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(mocks.univerCreate).not.toHaveBeenCalled();

    mocks.spreadsheetCollaborationSession = {
      resource_type: "spreadsheet",
      project_id: projectId,
      resource_id: resourceId,
      room: `project:${projectId}:spreadsheets:${resourceId}`,
      endpoint: "http://127.0.0.1:8000",
      unit_id: "official-unit-123",
      ready: true,
      service: { configured: true, reachable: true, required: [], url: null, detail: null },
    };
    mocks.spreadsheetCollaborationLoading = false;
    view.rerender(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(mocks.univerCreate).toHaveBeenCalledTimes(1);
    expect(mocks.univerLoad).toHaveBeenCalledTimes(1);
    expect(mocks.univerCreate.mock.results[0]?.value.univer.createUnit).not.toHaveBeenCalled();
  });

  it("starts the local fallback only after collaboration fails", async () => {
    vi.stubGlobal("ResizeObserver", class ResizeObserver {});
    mocks.workspaceResource = {
      ...mocks.workspaceResource,
      name: "Fallback Tracker",
      content: { id: "fallback-workbook", sheetOrder: [], sheets: {} },
    };
    mocks.spreadsheetCollaborationLoading = true;
    const view = render(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);
    expect(mocks.univerCreate).not.toHaveBeenCalled();

    mocks.spreadsheetCollaborationLoading = false;
    mocks.spreadsheetCollaborationError = new Error("Provisioning unavailable");
    view.rerender(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(mocks.univerCreate).toHaveBeenCalledTimes(1);
    expect(mocks.univerLoad).not.toHaveBeenCalled();
    expect(mocks.univerCreate).toHaveBeenCalledWith(expect.objectContaining({ collaboration: false }));
    expect(mocks.univerCreate.mock.results[0]?.value.univer.createUnit).toHaveBeenCalledTimes(1);
  });

  it("disposes safely when unmounted during server unit loading", async () => {
    vi.stubGlobal("ResizeObserver", class ResizeObserver {});
    mocks.workspaceResource = {
      ...mocks.workspaceResource,
      content: { id: "fallback-workbook", sheetOrder: [], sheets: {} },
    };
    mocks.spreadsheetCollaborationSession = {
      resource_type: "spreadsheet",
      project_id: projectId,
      resource_id: resourceId,
      room: `project:${projectId}:spreadsheets:${resourceId}`,
      endpoint: "http://127.0.0.1:8000",
      unit_id: "official-unit-123",
      ready: true,
      service: { configured: true, reachable: true, required: [], url: null, detail: null },
    };
    mocks.univerLoad.mockReturnValue(new Promise(() => undefined));

    const view = render(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    view.unmount();

    expect(mocks.univerDispose).toHaveBeenCalledTimes(1);
  });

  it("does not reload the official unit on ordinary rerenders", async () => {
    vi.stubGlobal("ResizeObserver", class ResizeObserver {});
    mocks.workspaceResource = {
      ...mocks.workspaceResource,
      content: { id: "fallback-workbook", sheetOrder: [], sheets: {} },
    };
    mocks.spreadsheetCollaborationSession = {
      resource_type: "spreadsheet",
      project_id: projectId,
      resource_id: resourceId,
      room: `project:${projectId}:spreadsheets:${resourceId}`,
      endpoint: "http://127.0.0.1:8000",
      unit_id: "official-unit-123",
      ready: true,
      service: { configured: true, reachable: true, required: [], url: null, detail: null },
    };

    const view = render(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    view.rerender(<WorkspaceSpreadsheetEditor projectId={projectId} resourceId={resourceId} onBack={vi.fn()} />);
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(mocks.univerCreate).toHaveBeenCalledTimes(1);
    expect(mocks.univerLoad).toHaveBeenCalledTimes(1);
  });
});
