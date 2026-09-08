import { ChevronRight, Download, Edit, FilePlus2, FileText, Folder, FolderPlus, MoveRight, Table2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ConfirmAction } from "@/components/common/confirm-action";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/features/auth/api";
import { userFacingErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

import {
  useCreateWorkspaceFolderMutation,
  useCreateWorkspaceNativeResourceMutation,
  useDeleteWorkspaceFolderMutation,
  useDeleteWorkspaceNativeResourceMutation,
  useDownloadProjectFileMutation,
  useMoveWorkspaceNativeResourceMutation,
  useMoveWorkspaceFileMutation,
  useRenameWorkspaceNativeResourceMutation,
  useUpdateWorkspaceNativeResourceTaskLinkMutation,
  useUpdateWorkspaceFolderMutation,
  useWorkspaceContentsQuery,
  useWorkspaceFolderTreeQuery,
} from "./hooks";
import { WorkspaceDocumentEditor, WorkspaceSpreadsheetEditor } from "./workspace-native-editors";
import type { WorkspaceFile, WorkspaceFolder, WorkspaceNativeResource, WorkspaceResourceKind } from "./types";

type BreadcrumbItem = {
  id: string | null;
  name: string;
};

export function ProjectWorkspace({ canManage, projectId }: { projectId: string; canManage: boolean }) {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: "Workspace" }]);
  const [openResource, setOpenResource] = useState<{ id: string; kind: WorkspaceResourceKind } | null>(null);
  const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id ?? null;
  const contentsQuery = useWorkspaceContentsQuery(projectId, currentFolderId);
  const folderTreeQuery = useWorkspaceFolderTreeQuery(projectId);
  const createFolder = useCreateWorkspaceFolderMutation(projectId);
  const createDocument = useCreateWorkspaceNativeResourceMutation(projectId, "documents");
  const createSpreadsheet = useCreateWorkspaceNativeResourceMutation(projectId, "spreadsheets");
  const renameDocument = useRenameWorkspaceNativeResourceMutation(projectId, "documents");
  const renameSpreadsheet = useRenameWorkspaceNativeResourceMutation(projectId, "spreadsheets");
  const moveDocument = useMoveWorkspaceNativeResourceMutation(projectId, "documents");
  const moveSpreadsheet = useMoveWorkspaceNativeResourceMutation(projectId, "spreadsheets");
  const updateDocumentTaskLink = useUpdateWorkspaceNativeResourceTaskLinkMutation(projectId, "documents");
  const updateSpreadsheetTaskLink = useUpdateWorkspaceNativeResourceTaskLinkMutation(projectId, "spreadsheets");
  const deleteDocument = useDeleteWorkspaceNativeResourceMutation(projectId, "documents");
  const deleteSpreadsheet = useDeleteWorkspaceNativeResourceMutation(projectId, "spreadsheets");
  const updateFolder = useUpdateWorkspaceFolderMutation(projectId);
  const deleteFolder = useDeleteWorkspaceFolderMutation(projectId);
  const moveFile = useMoveWorkspaceFileMutation(projectId);
  const downloadFile = useDownloadProjectFileMutation(projectId);
  const [actionError, setActionError] = useState<string | null>(null);
  const folders = contentsQuery.data?.folders ?? [];
  const files = contentsQuery.data?.files ?? [];
  const documents = contentsQuery.data?.documents ?? [];
  const spreadsheets = contentsQuery.data?.spreadsheets ?? [];
  const folderTree = folderTreeQuery.data ?? [];

  useEffect(() => {
    setActionError(null);
  }, [currentFolderId]);

  function openFolder(folder: WorkspaceFolder) {
    setBreadcrumbs((current) => [...current, { id: folder.id, name: folder.name }]);
  }

  function openBreadcrumb(index: number) {
    setBreadcrumbs((current) => current.slice(0, index + 1));
  }

  async function onCreateFolder(name: string) {
    await createFolder.mutateAsync({ name, parent_folder_id: currentFolderId });
  }

  async function onCreateNativeResource(kind: WorkspaceResourceKind, name: string, taskId: string | null) {
    const created = await (kind === "documents" ? createDocument : createSpreadsheet).mutateAsync({
      name,
      content: kind === "documents" ? emptyDocumentContent() : emptySpreadsheetContent(),
      folder_id: currentFolderId,
      task_id: taskId,
    });
    setOpenResource({ id: created.id, kind });
  }

  async function onRenameFolder(folderId: string, name: string) {
    await updateFolder.mutateAsync({ folderId, payload: { name } });
    setBreadcrumbs((current) => current.map((item) => (item.id === folderId ? { ...item, name } : item)));
  }

  async function onMoveFolder(folderId: string, folderIdTarget: string | null) {
    await updateFolder.mutateAsync({ folderId, payload: { parent_folder_id: folderIdTarget } });
  }

  async function onDeleteFolder(folderId: string) {
    await deleteFolder.mutateAsync(folderId);
  }

  async function onMoveFile(fileId: string, folderId: string | null) {
    await moveFile.mutateAsync({ fileId, folderId });
  }

  async function onRenameNativeResource(kind: WorkspaceResourceKind, resourceId: string, name: string) {
    const mutation = kind === "documents" ? renameDocument : renameSpreadsheet;
    await mutation.mutateAsync({ resourceId, payload: { name } });
  }

  async function onMoveNativeResource(kind: WorkspaceResourceKind, resourceId: string, folderId: string | null) {
    const mutation = kind === "documents" ? moveDocument : moveSpreadsheet;
    await mutation.mutateAsync({ resourceId, payload: { folder_id: folderId } });
  }

  async function onUpdateNativeResourceTaskLink(kind: WorkspaceResourceKind, resourceId: string, taskId: string | null) {
    const mutation = kind === "documents" ? updateDocumentTaskLink : updateSpreadsheetTaskLink;
    await mutation.mutateAsync({ resourceId, payload: { task_id: taskId } });
  }

  async function onDeleteNativeResource(kind: WorkspaceResourceKind, resourceId: string) {
    const mutation = kind === "documents" ? deleteDocument : deleteSpreadsheet;
    await mutation.mutateAsync(resourceId);
  }

  async function onDownload(file: WorkspaceFile) {
    try {
      setActionError(null);
      const downloadedFile = await downloadFile.mutateAsync(file.id);
      const objectUrl = URL.createObjectURL(downloadedFile.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadedFile.fileName || file.file_name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }

  const isBusy =
    createFolder.isPending ||
    createDocument.isPending ||
    createSpreadsheet.isPending ||
    updateFolder.isPending ||
    deleteFolder.isPending ||
    moveFile.isPending ||
    renameDocument.isPending ||
    renameSpreadsheet.isPending ||
    moveDocument.isPending ||
    moveSpreadsheet.isPending ||
    updateDocumentTaskLink.isPending ||
    updateSpreadsheetTaskLink.isPending ||
    deleteDocument.isPending ||
    deleteSpreadsheet.isPending ||
    downloadFile.isPending;

  if (openResource?.kind === "documents") {
    return <WorkspaceDocumentEditor projectId={projectId} resourceId={openResource.id} onBack={() => setOpenResource(null)} />;
  }

  if (openResource?.kind === "spreadsheets") {
    return <WorkspaceSpreadsheetEditor projectId={projectId} resourceId={openResource.id} onBack={() => setOpenResource(null)} />;
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>Organize existing project files into folders and subfolders.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <NativeResourceFormDialog
            title="Create Document"
            submitLabel="Create Document"
            onSubmit={(name, taskId) => onCreateNativeResource("documents", name, taskId)}
          >
            <Button type="button" size="sm" variant="outline">
              <FilePlus2 className="size-4" aria-hidden="true" />
              New Document
            </Button>
          </NativeResourceFormDialog>
          <NativeResourceFormDialog
            title="Create Spreadsheet"
            submitLabel="Create Spreadsheet"
            onSubmit={(name, taskId) => onCreateNativeResource("spreadsheets", name, taskId)}
          >
            <Button type="button" size="sm" variant="outline">
              <Table2 className="size-4" aria-hidden="true" />
              New Spreadsheet
            </Button>
          </NativeResourceFormDialog>
          {canManage ? (
            <FolderFormDialog title="Create Folder" description="Create a folder in the current workspace location." submitLabel="Create Folder" onSubmit={onCreateFolder}>
              <Button type="button" size="sm">
                <FolderPlus className="size-4" aria-hidden="true" />
                New Folder
              </Button>
            </FolderFormDialog>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <WorkspaceBreadcrumbs items={breadcrumbs} onOpen={openBreadcrumb} />

        {actionError ? <InlineWorkspaceError message={actionError} /> : null}
        {createFolder.error ? <InlineWorkspaceError message={workspaceErrorMessage(createFolder.error)} /> : null}
        {createDocument.error ? <InlineWorkspaceError message={workspaceErrorMessage(createDocument.error)} /> : null}
        {createSpreadsheet.error ? <InlineWorkspaceError message={workspaceErrorMessage(createSpreadsheet.error)} /> : null}
        {updateFolder.error ? <InlineWorkspaceError message={workspaceErrorMessage(updateFolder.error)} /> : null}
        {deleteFolder.error ? <InlineWorkspaceError message={workspaceErrorMessage(deleteFolder.error)} /> : null}
        {moveFile.error ? <InlineWorkspaceError message={workspaceErrorMessage(moveFile.error)} /> : null}

        {contentsQuery.isLoading ? <LoadingState label="Loading workspace" /> : null}
        {contentsQuery.isError ? <ErrorState title="Workspace could not be loaded" message={workspaceErrorMessage(contentsQuery.error)} /> : null}

        {!contentsQuery.isLoading && !contentsQuery.isError ? (
          folders.length === 0 && files.length === 0 && documents.length === 0 && spreadsheets.length === 0 ? (
            <EmptyState title="This workspace location is empty." />
          ) : (
            <div className="overflow-hidden rounded-md border bg-surface">
              {folders.map((folder) => (
                <FolderRow
                  key={folder.id}
                  canManage={canManage}
                  disabled={isBusy}
                  folder={folder}
                  folderTree={folderTree}
                  onDelete={onDeleteFolder}
                  onMove={onMoveFolder}
                  onOpen={openFolder}
                  onRename={onRenameFolder}
                />
              ))}
              {documents.map((document) => (
                <NativeResourceRow
                  key={document.id}
                  disabled={isBusy}
                  folderTree={folderTree}
                  icon="document"
                  kind="documents"
                  label="Document"
                  onDelete={onDeleteNativeResource}
                  onMove={onMoveNativeResource}
                  onOpen={(resource) => setOpenResource({ id: resource.id, kind: "documents" })}
                  onRename={onRenameNativeResource}
                  onTaskLink={onUpdateNativeResourceTaskLink}
                  resource={document}
                />
              ))}
              {spreadsheets.map((spreadsheet) => (
                <NativeResourceRow
                  key={spreadsheet.id}
                  disabled={isBusy}
                  folderTree={folderTree}
                  icon="spreadsheet"
                  kind="spreadsheets"
                  label="Spreadsheet"
                  onDelete={onDeleteNativeResource}
                  onMove={onMoveNativeResource}
                  onOpen={(resource) => setOpenResource({ id: resource.id, kind: "spreadsheets" })}
                  onRename={onRenameNativeResource}
                  onTaskLink={onUpdateNativeResourceTaskLink}
                  resource={spreadsheet}
                />
              ))}
              {files.map((file) => (
                <FileRow
                  key={file.id}
                  canManage={canManage}
                  disabled={isBusy}
                  file={file}
                  folderTree={folderTree}
                  onDownload={onDownload}
                  onMove={onMoveFile}
                />
              ))}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function NativeResourceRow({
  disabled,
  folderTree,
  icon,
  kind,
  label,
  onDelete,
  onMove,
  onOpen,
  onRename,
  onTaskLink,
  resource,
}: {
  disabled: boolean;
  folderTree: WorkspaceFolder[];
  icon: "document" | "spreadsheet";
  kind: WorkspaceResourceKind;
  label: string;
  onDelete: (kind: WorkspaceResourceKind, resourceId: string) => Promise<void>;
  onMove: (kind: WorkspaceResourceKind, resourceId: string, folderId: string | null) => Promise<void>;
  onOpen: (resource: WorkspaceNativeResource) => void;
  onRename: (kind: WorkspaceResourceKind, resourceId: string, name: string) => Promise<void>;
  onTaskLink: (kind: WorkspaceResourceKind, resourceId: string, taskId: string | null) => Promise<void>;
  resource: WorkspaceNativeResource;
}) {
  const Icon = icon === "spreadsheet" ? Table2 : FileText;

  return (
    <div className="grid gap-3 border-b px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <button type="button" className="flex min-w-0 items-start gap-3 text-left" aria-label={`Open ${label.toLowerCase()} ${resource.name}`} onClick={() => onOpen(resource)}>
        <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{resource.name}</p>
            <Badge variant="secondary">{label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {resource.task_id ? "Linked to task" : "Project workspace"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Updated {formatDateTime(resource.updated_at)}</p>
        </span>
      </button>
      <div className="flex flex-wrap justify-end gap-2">
        <FolderFormDialog
          title={`Rename ${label}`}
          description={`Rename this ${label.toLowerCase()} without changing its folder or task link.`}
          initialName={resource.name}
          submitLabel="Save"
          onSubmit={(name) => onRename(kind, resource.id, name)}
        >
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <Edit className="size-4" aria-hidden="true" />
            Rename
          </Button>
        </FolderFormDialog>
        <MoveDialog
          title={`Move ${label}`}
          description={`Move this ${label.toLowerCase()} in the workspace.`}
          currentTargetId={resource.folder_id}
          disabled={disabled}
          items={folderTree.map((folder) => ({ id: folder.id, label: folderPath(folderTree, folder) }))}
          onSubmit={(folderId) => onMove(kind, resource.id, folderId)}
        />
        <TaskLinkDialog disabled={disabled} currentTaskId={resource.task_id} onSubmit={(taskId) => onTaskLink(kind, resource.id, taskId)} />
        <ConfirmAction
          title={`Delete ${label.toLowerCase()}?`}
          description="This removes the native workspace item. Uploaded files are not affected."
          confirmLabel="Delete"
          onConfirm={() => {
            void onDelete(kind, resource.id);
          }}
        >
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <Trash2 className="size-4" aria-hidden="true" />
            Delete
          </Button>
        </ConfirmAction>
      </div>
    </div>
  );
}

function WorkspaceBreadcrumbs({ items, onOpen }: { items: BreadcrumbItem[]; onOpen: (index: number) => void }) {
  return (
    <nav aria-label="Workspace breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
      {items.map((item, index) => (
        <span key={item.id ?? "root"} className="inline-flex items-center gap-1">
          {index > 0 ? <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-8 px-2", index === items.length - 1 && "pointer-events-none text-foreground")}
            onClick={() => onOpen(index)}
          >
            {item.name}
          </Button>
        </span>
      ))}
    </nav>
  );
}

function FolderRow({
  canManage,
  disabled,
  folder,
  folderTree,
  onDelete,
  onMove,
  onOpen,
  onRename,
}: {
  canManage: boolean;
  disabled: boolean;
  folder: WorkspaceFolder;
  folderTree: WorkspaceFolder[];
  onDelete: (folderId: string) => Promise<void>;
  onMove: (folderId: string, parentFolderId: string | null) => Promise<void>;
  onOpen: (folder: WorkspaceFolder) => void;
  onRename: (folderId: string, name: string) => Promise<void>;
}) {
  const moveTargets = useMemo(() => folderMoveTargets(folderTree, folder.id), [folder.id, folderTree]);

  return (
    <div className="grid gap-3 border-b px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <button
        type="button"
        className="flex min-w-0 items-start gap-3 text-left"
        aria-label={`Open folder ${folder.name}`}
        onClick={() => onOpen(folder)}
      >
        <Folder className="mt-0.5 size-5 shrink-0 text-brand-red" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">{folder.name}</span>
          <span className="mt-1 block text-xs text-muted-foreground">Folder</span>
        </span>
      </button>
      {canManage ? (
        <div className="flex flex-wrap justify-end gap-2">
          <FolderFormDialog
            title="Rename Folder"
            description="Rename this folder without changing its contents."
            initialName={folder.name}
            submitLabel="Save"
            onSubmit={(name) => onRename(folder.id, name)}
          >
            <Button type="button" variant="outline" size="sm" disabled={disabled}>
              <Edit className="size-4" aria-hidden="true" />
              Rename
            </Button>
          </FolderFormDialog>
          <MoveDialog
            title="Move Folder"
            description="Choose the destination folder."
            currentTargetId={folder.parent_folder_id}
            disabled={disabled}
            items={moveTargets}
            onSubmit={(targetFolderId) => onMove(folder.id, targetFolderId)}
          />
          <ConfirmAction
            title="Delete folder?"
            description="Only empty folders can be deleted."
            confirmLabel="Delete"
            onConfirm={() => {
              void onDelete(folder.id);
            }}
          >
            <Button type="button" variant="outline" size="sm" disabled={disabled}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          </ConfirmAction>
        </div>
      ) : null}
    </div>
  );
}

function FileRow({
  canManage,
  disabled,
  file,
  folderTree,
  onDownload,
  onMove,
}: {
  canManage: boolean;
  disabled: boolean;
  file: WorkspaceFile;
  folderTree: WorkspaceFolder[];
  onDownload: (file: WorkspaceFile) => Promise<void>;
  onMove: (fileId: string, folderId: string | null) => Promise<void>;
}) {
  return (
    <div className="grid gap-3 border-b px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{file.file_name}</p>
            <Badge variant="secondary">{formatFileCategory(file.file_category)}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {file.phase_name} / {file.task_name}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Uploaded by {file.uploader_name} on {formatDateTime(file.created_at)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {canManage ? (
          <MoveDialog
            title="Move File"
            description="Move this file in the workspace. The stored file is not copied or renamed."
            currentTargetId={file.folder_id}
            disabled={disabled}
            items={folderTree.map((folder) => ({ id: folder.id, label: folderPath(folderTree, folder) }))}
            onSubmit={(targetFolderId) => onMove(file.id, targetFolderId)}
          />
        ) : null}
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void onDownload(file)} aria-label={`Download ${file.file_name}`}>
          <Download className="size-4" aria-hidden="true" />
          Download
        </Button>
      </div>
    </div>
  );
}

function FolderFormDialog({
  children,
  description,
  initialName = "",
  onSubmit,
  submitLabel,
  title,
}: {
  children: React.ReactNode;
  description: string;
  initialName?: string;
  onSubmit: (name: string) => Promise<void>;
  submitLabel: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
    }
  }, [initialName, open]);

  async function submit() {
    if (!trimmedName) {
      setError("Folder name is required.");
      return;
    }
    try {
      await onSubmit(trimmedName);
      setOpen(false);
    } catch (submitError) {
      setError(workspaceErrorMessage(submitError));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`${title}-folder-name`}>Folder Name</Label>
          <Input id={`${title}-folder-name`} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!trimmedName} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NativeResourceFormDialog({
  children,
  onSubmit,
  submitLabel,
  title,
}: {
  children: React.ReactNode;
  onSubmit: (name: string, taskId: string | null) => Promise<void>;
  submitLabel: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [taskId, setTaskId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();
  const trimmedTaskId = taskId.trim();

  useEffect(() => {
    if (open) {
      setName("");
      setTaskId("");
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    try {
      await onSubmit(trimmedName, trimmedTaskId || null);
      setOpen(false);
    } catch (submitError) {
      setError(workspaceErrorMessage(submitError));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Create a native workspace item in the current location.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`${title}-name`}>Name</Label>
            <Input id={`${title}-name`} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${title}-task`}>Task ID</Label>
            <Input id={`${title}-task`} value={taskId} placeholder="Optional" onChange={(event) => setTaskId(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!trimmedName} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskLinkDialog({ currentTaskId, disabled, onSubmit }: { currentTaskId: string | null; disabled: boolean; onSubmit: (taskId: string | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [taskId, setTaskId] = useState(currentTaskId ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTaskId(currentTaskId ?? "");
      setError(null);
    }
  }, [currentTaskId, open]);

  async function submit() {
    try {
      await onSubmit(taskId.trim() || null);
      setOpen(false);
    } catch (submitError) {
      setError(workspaceErrorMessage(submitError));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          Link Task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Task</DialogTitle>
          <DialogDescription>Set or remove the optional task association.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="workspace-task-link">Task ID</Label>
          <Input id="workspace-task-link" value={taskId} placeholder="Empty removes the task link" onChange={(event) => setTaskId(event.target.value)} />
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  currentTargetId,
  description,
  disabled,
  items,
  onSubmit,
  title,
}: {
  currentTargetId: string | null;
  description: string;
  disabled: boolean;
  items: { id: string; label: string }[];
  onSubmit: (folderId: string | null) => Promise<void>;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(currentTargetId ?? "root");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTarget(currentTargetId ?? "root");
      setError(null);
    }
  }, [currentTargetId, open]);

  async function submit() {
    try {
      await onSubmit(target === "root" ? null : target);
      setOpen(false);
    } catch (submitError) {
      setError(workspaceErrorMessage(submitError));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <MoveRight className="size-4" aria-hidden="true" />
          Move
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Destination</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger aria-label={`${title} destination`}>
              <SelectValue placeholder="Workspace root" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Workspace</SelectItem>
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()}>
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function folderMoveTargets(folders: WorkspaceFolder[], folderId: string) {
  const descendants = descendantFolderIds(folders, folderId);
  return folders
    .filter((folder) => folder.id !== folderId && !descendants.has(folder.id))
    .map((folder) => ({ id: folder.id, label: folderPath(folders, folder) }));
}

function descendantFolderIds(folders: WorkspaceFolder[], folderId: string) {
  const childrenByParent = new Map<string, WorkspaceFolder[]>();
  folders.forEach((folder) => {
    if (!folder.parent_folder_id) {
      return;
    }
    childrenByParent.set(folder.parent_folder_id, [...(childrenByParent.get(folder.parent_folder_id) ?? []), folder]);
  });
  const descendants = new Set<string>();
  const visit = (id: string) => {
    (childrenByParent.get(id) ?? []).forEach((child) => {
      descendants.add(child.id);
      visit(child.id);
    });
  };
  visit(folderId);
  return descendants;
}

function folderPath(folders: WorkspaceFolder[], folder: WorkspaceFolder) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  const names = [folder.name];
  let parentId = folder.parent_folder_id;
  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent) {
      break;
    }
    names.unshift(parent.name);
    parentId = parent.parent_folder_id;
  }
  return names.join(" / ");
}

function InlineWorkspaceError({ message }: { message: string }) {
  return <p className="rounded-md border border-error/20 bg-error/5 px-3 py-2 text-sm text-error">{message}</p>;
}

function workspaceErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return userFacingErrorMessage(error, {
      action: "workspace details",
      conflict: "That folder is not empty or a folder with that name already exists.",
      forbidden: "You do not have permission to change this workspace.",
      notFound: "The workspace item could not be found.",
      server: "Workspace is unavailable. Please try again shortly.",
      validation: error instanceof ApiError ? error.message : "That workspace change is not allowed.",
    });
  }

  return "Workspace could not be updated.";
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatFileCategory(value: WorkspaceFile["file_category"]) {
  if (value === "work_submission") {
    return "Work submission";
  }
  if (value === "finance") {
    return "Finance";
  }
  return "Reference";
}

function emptyDocumentContent(): Record<string, unknown> {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function emptySpreadsheetContent(): Record<string, unknown> {
  return {
    id: "workbook",
    name: "Workbook",
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "Sheet1",
        cellData: {},
      },
    },
  };
}
