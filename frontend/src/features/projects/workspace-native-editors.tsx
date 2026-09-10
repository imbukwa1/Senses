import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import StarterKit from "@tiptap/starter-kit";
import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import { ArrowLeft, Bold, Heading1, Heading2, Italic, List, ListOrdered, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";
import { userFacingErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

import {
  useRenameWorkspaceNativeResourceMutation,
  useDocumentCollaborationSessionQuery,
  useSpreadsheetCollaborationSessionQuery,
  useUpdateWorkspaceNativeResourceContentMutation,
  useWorkspaceNativeResourceQuery,
} from "./hooks";

type WorkspaceNativeEditorProps = {
  onBack: () => void;
  projectId: string;
  resourceId: string;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "failed";

const emptyDocument: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function WorkspaceDocumentEditor({ onBack, projectId, resourceId }: WorkspaceNativeEditorProps) {
  const { token, user } = useAuth();
  const query = useWorkspaceNativeResourceQuery(projectId, "documents", resourceId);
  const collaborationQuery = useDocumentCollaborationSessionQuery(projectId, resourceId);
  const renameMutation = useRenameWorkspaceNativeResourceMutation(projectId, "documents");
  const saveMutation = useUpdateWorkspaceNativeResourceContentMutation(projectId, "documents", resourceId);
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "online" | "offline" | "error">("connecting");

  const collaborationEndpoint = collaborationQuery.data?.endpoint ?? null;
  const collaborationRoom = collaborationQuery.data?.room ?? null;
  const collaborationKey = `${projectId}:${resourceId}`;
  const collaborative = Boolean(collaborationEndpoint && collaborationRoom && token);
  const resourceAvailable = Boolean(query.data?.id);
  const editorReady = resourceAvailable && !collaborationQuery.isLoading;
  const ydoc = useMemo(() => (collaborative && collaborationKey ? new Y.Doc() : null), [collaborationKey, collaborative]);
  const provider = useMemo(() => {
    if (!ydoc || !collaborationEndpoint || !collaborationRoom || !token) {
      return null;
    }
    return new HocuspocusProvider({
      url: collaborationEndpoint,
      name: collaborationRoom,
      document: ydoc,
      token,
    });
  }, [collaborationEndpoint, collaborationRoom, token, ydoc]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: collaborative ? false : undefined }),
      ...(provider && ydoc
        ? [
            Collaboration.configure({ document: ydoc }),
            CollaborationCaret.configure({
              provider,
              user: { name: user?.name ?? "SENSES user", color: "#c92a2a" },
            }),
          ]
        : []),
    ],
    content: editorReady && !collaborative ? emptyDocument : undefined,
    immediatelyRender: editorReady,
    editorProps: {
      attributes: {
        "aria-label": "Document editor",
        class:
          "min-h-[24rem] w-full rounded-md border bg-surface px-4 py-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (collaborative) {
        setSaveState((previous) => previous === "saved" ? previous : "saved");
        setActionError((previous) => previous === null ? previous : null);
        return;
      }
      const nextContent = currentEditor.getJSON() as Record<string, unknown>;
      setDraft(nextContent);
      setSaveState((previous) => previous === "dirty" ? previous : "dirty");
      setActionError((previous) => previous === null ? previous : null);
    },
  }, [provider, ydoc, collaborative, editorReady, user?.name]);

  const content = useMemo(() => normalizeDocumentContent(query.data?.content), [query.data?.content]);

  const saveDraft = useCallback(
    async (nextContent: Record<string, unknown>) => {
      setSaveState("saving");
      try {
        await saveMutation.mutateAsync({ content: nextContent });
        setDraft(null);
        setSaveState("saved");
      } catch (error) {
        setSaveState("failed");
        setActionError(nativeEditorErrorMessage(error));
      }
    },
    [saveMutation],
  );

  useEffect(() => {
    if (!query.data || !editor || editor.isDestroyed) {
      return;
    }
    setTitle(query.data.name);
    if (collaborative) {
      return;
    }
    editor.commands.setContent(content, { emitUpdate: false });
    setDraft(null);
    setSaveState("idle");
  }, [collaborative, content, editor, query.data]);

  useEffect(() => {
    if (!provider || !ydoc || !editor || !resourceAvailable) {
      if (!collaborationQuery.isLoading && !collaborative) {
        setConnectionState((previous) => previous === "offline" ? previous : "offline");
      }
      return undefined;
    }

    setConnectionState((previous) => previous === "connecting" ? previous : "connecting");
    const handleSynced = () => {
      // Only seed an empty shared document. Existing Yjs state always wins
      // over the JSONB checkpoint to prevent a stale client overwrite.
      if (!editor.isDestroyed && ydoc.getXmlFragment("default").length === 0) {
        editor.commands.setContent(content, { emitUpdate: false });
      }
      setConnectionState((previous) => previous === "online" ? previous : "online");
      setSaveState((previous) => previous === "saved" ? previous : "saved");
    };
    const handleStatus = ({ status }: { status: WebSocketStatus }) => {
      const nextState = status === WebSocketStatus.Connected ? "online" : status === WebSocketStatus.Disconnected ? "offline" : "connecting";
      setConnectionState((previous) => previous === nextState ? previous : nextState);
    };
    const handleAuthenticationFailed = () => {
      setConnectionState((previous) => previous === "error" ? previous : "error");
      setActionError((previous) => previous === "Document collaboration authorization was rejected."
        ? previous
        : "Document collaboration authorization was rejected.");
    };
    provider.on("synced", handleSynced);
    provider.on("status", handleStatus);
    provider.on("authenticationFailed", handleAuthenticationFailed);
    return () => {
      provider.off("synced", handleSynced);
      provider.off("status", handleStatus);
      provider.off("authenticationFailed", handleAuthenticationFailed);
      provider.destroy();
    };
  }, [collaborationQuery.isLoading, collaborative, content, editor, provider, resourceAvailable, ydoc]);

  useEffect(() => {
    if (!draft || collaborative) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveDraft(draft);
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [collaborative, draft, saveDraft]);

  useEffect(() => {
    return () => {
      if (draft && !collaborative) {
        void saveDraft(draft);
      }
    };
  }, [collaborative, draft, saveDraft]);

  useEffect(() => {
    if (collaborationQuery.error) {
      setActionError(nativeEditorErrorMessage(collaborationQuery.error));
    }
  }, [collaborationQuery.error]);

  async function rename() {
    const name = title.trim();
    if (!name) {
      setActionError("Name is required.");
      return;
    }
    try {
      await renameMutation.mutateAsync({ resourceId, payload: { name } });
      setActionError(null);
    } catch (error) {
      setActionError(nativeEditorErrorMessage(error));
    }
  }

  return (
    <NativeEditorShell
      actionError={actionError}
      isError={query.isError}
      isLoading={query.isLoading}
      kindLabel="Document"
      name={query.data?.name ?? "Document"}
      onBack={onBack}
      queryError={query.error}
      saveState={saveState}
      statusLabel={collaborative ? (connectionState === "online" ? "Collaborative" : connectionState === "offline" ? "Offline" : "Connecting") : "Local fallback"}
      titleControls={
        <TitleControls disabled={renameMutation.isPending} label="Document Name" onRename={rename} setTitle={setTitle} title={title} />
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" aria-label="Document formatting toolbar">
          <ToolbarButton active={editor?.isActive("bold")} disabled={!editor} label="Bold" onClick={() => editor?.chain().focus().toggleBold().run()}>
            <Bold className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive("italic")} disabled={!editor} label="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <Italic className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("heading", { level: 1 })}
            disabled={!editor}
            label="Heading 1"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("heading", { level: 2 })}
            disabled={!editor}
            label="Heading 2"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("bulletList")}
            disabled={!editor}
            label="Bulleted List"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("orderedList")}
            disabled={!editor}
            label="Numbered List"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-4" aria-hidden="true" />
          </ToolbarButton>
        </div>
        <EditorContent editor={editor} />
      </div>
    </NativeEditorShell>
  );
}

export function WorkspaceSpreadsheetEditor({ onBack, projectId, resourceId }: WorkspaceNativeEditorProps) {
  const query = useWorkspaceNativeResourceQuery(projectId, "spreadsheets", resourceId);
  const collaborationQuery = useSpreadsheetCollaborationSessionQuery(projectId, resourceId);
  const renameMutation = useRenameWorkspaceNativeResourceMutation(projectId, "spreadsheets");
  const saveMutation = useUpdateWorkspaceNativeResourceContentMutation(projectId, "spreadsheets", resourceId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState("");
  const [fallbackJson, setFallbackJson] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [univerUnavailable, setUniverUnavailable] = useState(false);
  const [collaborationActive, setCollaborationActive] = useState(false);
  const [spreadsheetConnectionState, setSpreadsheetConnectionState] = useState<"connecting" | "online" | "reconnected" | "offline" | "error">("connecting");
  const saveDraftRef = useRef<((content: Record<string, unknown>) => Promise<void>) | null>(null);

  const content = useMemo(() => normalizeSpreadsheetContent(query.data?.content), [query.data?.content]);
  const resourceAvailable = Boolean(query.data?.id);

  const saveDraft = useCallback(
    async (nextContent: Record<string, unknown>) => {
      setSaveState("saving");
      try {
        await saveMutation.mutateAsync({ content: nextContent });
        setSaveState("saved");
      } catch (error) {
        setSaveState("failed");
        setActionError(nativeEditorErrorMessage(error));
      }
    },
    [saveMutation],
  );

  useEffect(() => {
    saveDraftRef.current = saveDraft;
  }, [saveDraft]);

  useEffect(() => {
    if (!query.data) {
      return;
    }
    setTitle(query.data.name);
    setFallbackJson(JSON.stringify(content, null, 2));
    setDraft(null);
    setSaveState("idle");
  }, [content, query.data]);

  useEffect(() => {
    if (!resourceAvailable || !containerRef.current) {
      return undefined;
    }
    // Wait for provisioning to settle before creating either a local workbook
    // or a collaborative one. This prevents two Univer instances during the
    // normal resource/session request race.
    if (collaborationQuery.isLoading) {
      return undefined;
    }
    if (typeof window.ResizeObserver === "undefined") {
      setUniverUnavailable(true);
      return undefined;
    }
    let cancelled = false;
    let disposed = false;
    let disposeInstance: (() => void) | null = null;
    let loadTimeout: number | undefined;

    const disposeCurrentInstance = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      window.clearTimeout(loadTimeout);
      disposeInstance?.();
      disposeInstance = null;
    };

    async function mountUniver() {
      try {
        await import("@univerjs/preset-sheets-core/lib/index.css");
        const [{ createUniver, UniverInstanceType }, { UniverSheetsCorePreset }, { UniverSheetsAdvancedPreset }, { UniverSheetsCollaborationPreset }] = await Promise.all([
          import("@univerjs/presets"),
          import("@univerjs/preset-sheets-core"),
          import("@univerjs/preset-sheets-advanced"),
          import("@univerjs/preset-sheets-collaboration"),
        ]);
        if (cancelled || !containerRef.current) {
          return;
        }
        const collaborationEnabled = Boolean(collaborationQuery.data?.unit_id && collaborationQuery.data.endpoint);
        const univerEndpoint = collaborationQuery.data?.endpoint;
        const containerId = `univer-spreadsheet-${resourceId}`;
        containerRef.current.id = containerId;
        const { univer, univerAPI } = createUniver({
          collaboration: true,
          presets: [
            UniverSheetsCorePreset({
              container: containerId,
              footer: { sheetBar: true, statisticBar: true },
              formulaBar: true,
              header: false,
              toolbar: true,
            }),
            ...(collaborationEnabled && univerEndpoint
              ? [
                  UniverSheetsAdvancedPreset({ universerEndpoint: univerEndpoint }),
                  UniverSheetsCollaborationPreset({ universerEndpoint: univerEndpoint, univerContainerId: containerId }),
                ]
              : []),
          ],
        });
        let reconnectTimer: number | undefined;
        let statusDisposable: { dispose?: () => void } | undefined;
        if (collaborationEnabled) {
          const api = univerAPI as unknown as {
            Event?: { CollaborationStatusChanged?: string };
            addEvent?: (event: string, callback: (payload: { unitId: string; status: string }) => void) => { dispose?: () => void };
          };
          const statusEvent = api.Event?.CollaborationStatusChanged;
          if (statusEvent && api.addEvent) {
            statusDisposable = api.addEvent(statusEvent, ({ unitId, status }) => {
              if (unitId !== collaborationQuery.data?.unit_id) {
                return;
              }
              if (status === "offline") {
                setSpreadsheetConnectionState("offline");
                return;
              }
              if (status === "synced") {
                setSpreadsheetConnectionState((previous) => previous === "offline" ? "reconnected" : "online");
                window.clearTimeout(reconnectTimer);
                reconnectTimer = window.setTimeout(() => setSpreadsheetConnectionState("online"), 2000);
                return;
              }
              setSpreadsheetConnectionState("connecting");
            });
          }
        }
        disposeInstance = () => {
          window.clearTimeout(reconnectTimer);
          statusDisposable?.dispose?.();
          univer.dispose();
        };
        if (collaborationEnabled && collaborationQuery.data?.unit_id) {
          const loadedUnit = await Promise.race([
            (univerAPI as unknown as { loadServerUnit: (unitId: string, type: number) => Promise<unknown> }).loadServerUnit(
              collaborationQuery.data.unit_id,
              UniverInstanceType.UNIVER_SHEET,
            ),
            new Promise<never>((_, reject) => {
              loadTimeout = window.setTimeout(() => reject(new Error("Collaborative spreadsheet timed out while loading.")), 15000);
            }),
          ]).finally(() => window.clearTimeout(loadTimeout));
          if (cancelled) {
            disposeCurrentInstance();
            return;
          }
          if (!loadedUnit) {
            throw new Error("Collaborative spreadsheet could not be loaded.");
          }
          setCollaborationActive(true);
          setSpreadsheetConnectionState("online");
        } else {
          univer.createUnit(UniverInstanceType.UNIVER_SHEET, content);
          setCollaborationActive(false);
        }
        const disposable = (univerAPI as unknown as { onCommandExecuted?: (callback: () => void) => { dispose?: () => void } }).onCommandExecuted?.(() => {
          if (collaborationEnabled) {
            setSaveState("saved");
            return;
          }
          const activeWorkbook = (univerAPI as unknown as { getActiveWorkbook?: () => { save?: () => Record<string, unknown> } | null }).getActiveWorkbook?.();
          const snapshot = activeWorkbook?.save?.();
          if (snapshot) {
            setDraft(snapshot);
            setSaveState("dirty");
            setActionError(null);
          }
        });
        const previousDispose = disposeInstance;
        disposeInstance = () => {
          disposable?.dispose?.();
          previousDispose?.();
        };
        if (cancelled) {
          disposeCurrentInstance();
          return;
        }
        setUniverUnavailable(false);
      } catch (error) {
        if (!cancelled) {
          disposeCurrentInstance();
          setCollaborationActive(false);
          setSpreadsheetConnectionState("error");
          setUniverUnavailable(true);
          setActionError(nativeEditorErrorMessage(error));
        }
      }
    }

    void mountUniver();
    return () => {
      cancelled = true;
      disposeCurrentInstance();
    };
  }, [collaborationQuery.data, collaborationQuery.error, collaborationQuery.isLoading, content, resourceAvailable, resourceId]);

  useEffect(() => {
    if (!draft || collaborationActive) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveDraft(draft);
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [collaborationActive, draft, saveDraft]);

  useEffect(() => {
    return () => {
      if (draft && !collaborationActive && saveDraftRef.current) {
        void saveDraftRef.current(draft);
      }
    };
  }, [collaborationActive, draft]);

  useEffect(() => {
    if (collaborationQuery.error) {
      setActionError(nativeEditorErrorMessage(collaborationQuery.error));
    }
  }, [collaborationQuery.error]);

  async function rename() {
    const name = title.trim();
    if (!name) {
      setActionError("Name is required.");
      return;
    }
    try {
      await renameMutation.mutateAsync({ resourceId, payload: { name } });
      setActionError(null);
    } catch (error) {
      setActionError(nativeEditorErrorMessage(error));
    }
  }

  function updateFallback(value: string) {
    setFallbackJson(value);
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      setDraft(parsed);
      setSaveState("dirty");
      setActionError(null);
    } catch {
      setActionError("Spreadsheet JSON is malformed.");
      setSaveState("failed");
    }
  }

  return (
    <NativeEditorShell
      actionError={actionError}
      isError={query.isError}
      isLoading={query.isLoading}
      kindLabel="Spreadsheet"
      name={query.data?.name ?? "Spreadsheet"}
      onBack={onBack}
      queryError={query.error}
      saveState={saveState}
      statusLabel={
        collaborationActive
          ? spreadsheetConnectionState === "reconnected"
            ? "Reconnected"
            : spreadsheetConnectionState === "offline"
              ? "Offline"
              : spreadsheetConnectionState === "error"
                ? "Collaboration error"
                : "Collaborative"
          : univerUnavailable
            ? "Local fallback"
            : "Connecting"
      }
      titleControls={<TitleControls disabled={renameMutation.isPending} label="Spreadsheet Name" onRename={rename} setTitle={setTitle} title={title} />}
    >
      <div className="space-y-3">
        <div ref={containerRef} className={cn("h-[34rem] min-h-[28rem] overflow-hidden rounded-md border bg-surface", univerUnavailable && "hidden")} />
        {univerUnavailable ? (
          <div className="space-y-2">
            <Label htmlFor="spreadsheet-json">Spreadsheet Content</Label>
            <Textarea
              id="spreadsheet-json"
              aria-label="Spreadsheet JSON editor"
              className="min-h-[28rem] font-mono"
              value={fallbackJson}
              onChange={(event) => updateFallback(event.target.value)}
            />
          </div>
        ) : null}
      </div>
    </NativeEditorShell>
  );
}

function NativeEditorShell({
  actionError,
  children,
  isError,
  isLoading,
  kindLabel,
  name,
  onBack,
  queryError,
  saveState,
  statusLabel,
  titleControls,
}: {
  actionError: string | null;
  children: React.ReactNode;
  isError: boolean;
  isLoading: boolean;
  kindLabel: string;
  name: string;
  onBack: () => void;
  queryError: unknown;
  saveState: SaveState;
  statusLabel?: string;
  titleControls: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Workspace
          </Button>
          <div className="flex items-center gap-2">
            {statusLabel ? <Badge variant="outline">{statusLabel}</Badge> : null}
            <SaveBadge state={saveState} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="break-words">{name}</CardTitle>
          <Badge variant="secondary">{kindLabel}</Badge>
        </div>
        {titleControls}
      </CardHeader>
      <CardContent className="space-y-4">
        {actionError ? <InlineEditorError message={actionError} /> : null}
        {isLoading ? <LoadingState label={`Loading ${kindLabel.toLowerCase()}`} /> : null}
        {isError ? <ErrorState title={`${kindLabel} could not be loaded`} message={nativeEditorErrorMessage(queryError)} /> : null}
        {!isLoading && !isError ? children : null}
      </CardContent>
    </Card>
  );
}

function TitleControls({
  disabled,
  label,
  onRename,
  setTitle,
  title,
}: {
  disabled: boolean;
  label: string;
  onRename: () => Promise<void>;
  setTitle: (title: string) => void;
  title: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="space-y-2">
        <Label htmlFor={`${label}-input`}>{label}</Label>
        <Input id={`${label}-input`} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <Button type="button" variant="outline" disabled={disabled || !title.trim()} onClick={() => void onRename()}>
        Save Name
      </Button>
    </div>
  );
}

function ToolbarButton({
  active,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="icon"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  const label = {
    dirty: "Unsaved",
    failed: "Autosave failed",
    idle: "Saved",
    saved: "Saved",
    saving: "Saving",
  }[state];

  return (
    <Badge variant={state === "failed" ? "error" : "secondary"} className="gap-1">
      <Save className="size-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}

function InlineEditorError({ message }: { message: string }) {
  return <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{message}</div>;
}

function normalizeDocumentContent(content: Record<string, unknown> | undefined): JSONContent {
  if (content && content.type === "doc") {
    return content as JSONContent;
  }
  return emptyDocument;
}

function normalizeSpreadsheetContent(content: Record<string, unknown> | undefined): Record<string, unknown> {
  if (content && Object.keys(content).length > 0) {
    return content;
  }
  return {
    id: "workbook",
    name: "Spreadsheet",
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "Sheet1",
        cellData: {},
        rowCount: 100,
        columnCount: 26,
      },
    },
  };
}

function nativeEditorErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return userFacingErrorMessage(error, {
      action: "workspace item",
      forbidden: "You do not have permission to change this workspace item.",
      notFound: "The workspace item could not be found.",
      validation: error.message,
    });
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Unable to reach the server. Please try again.";
}
