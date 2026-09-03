import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Edit, FileText, MessageSquare, Paperclip, Save, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ConfirmAction } from "@/components/common/confirm-action";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState, InlineErrorMessage } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { userFacingErrorMessage } from "@/lib/api-errors";

import {
  useChecklistQuery,
  useCreateTaskCommentMutation,
  useCreateChecklistItemMutation,
  useRemoveChecklistItemMutation,
  useSetChecklistItemCompletionMutation,
  useTaskCommentsQuery,
  useDownloadTaskFileMutation,
  useTaskFilesQuery,
  useTaskSupportersQuery,
  useUploadTaskFileMutation,
  useUpdateChecklistItemMutation,
} from "./hooks";
import { TaskFormDialog } from "./task-form-dialog";
import type { ChecklistItem, DashboardPhase, Task, TaskComment, TaskFile } from "./types";

const checklistItemSchema = z.object({
  description: z.string().trim().min(1, "Checklist item description is required."),
});

const commentSchema = z.object({
  comment: z.string().trim().min(1, "Comment is required."),
});

type ChecklistItemFormValues = z.infer<typeof checklistItemSchema>;
type CommentFormValues = z.infer<typeof commentSchema>;

export function TaskDetailDrawer({ children, phase, projectId, task }: { children: React.ReactNode; projectId: string; phase: DashboardPhase; task: Task }) {
  const [open, setOpen] = useState(false);
  const [editTaskOpen, setEditTaskOpen] = useState(false);
  const checklistQuery = useChecklistQuery(projectId, phase.id, task.id, open);
  const commentsQuery = useTaskCommentsQuery(projectId, phase.id, task.id, open);
  const filesQuery = useTaskFilesQuery(projectId, phase.id, task.id, open);
  const supportersQuery = useTaskSupportersQuery(projectId, phase.id, task.id, open);
  const checklist = checklistQuery.data;
  const taskProgress = checklist?.summary.progress;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="w-[min(42rem,calc(100vw-1rem))] p-0">
        <div className="flex min-h-full flex-col">
          <div className="border-b p-6 pr-12">
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={task.priority} />
                <StatusBadge value={task.status} />
              </div>
              <SheetTitle className="mt-3 text-xl">{task.name}</SheetTitle>
              <SheetDescription>Task details for phase {phase.name}.</SheetDescription>
            </SheetHeader>
            <div className="mt-4 flex flex-wrap gap-2">
              <TaskFormDialog mode="edit" projectId={projectId} phase={phase} task={task}>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditTaskOpen(true)} aria-expanded={editTaskOpen}>
                  <Edit className="size-4" aria-hidden="true" />
                  Edit Task
                </Button>
              </TaskFormDialog>
            </div>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            <TaskMetadata task={task} phase={phase} supporters={supportersQuery.data ?? []} supportersLoading={supportersQuery.isLoading} />
            {task.description ? (
              <section className="rounded-md border bg-background p-4">
                <h3 className="text-sm font-semibold text-foreground">Description</h3>
                <p className="mt-2 text-sm text-muted-foreground">{task.description}</p>
              </section>
            ) : null}
            <section className="rounded-md border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Deliverables</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Checklist items attached to this task.</p>
                </div>
                {checklist ? (
                  <p className="text-sm font-medium text-foreground">
                    {checklist.summary.completed_items} / {checklist.summary.total_items} completed
                  </p>
                ) : null}
              </div>
              {typeof taskProgress === "number" ? (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Backend task progress</span>
                    <span className="font-semibold text-foreground">{Math.round(taskProgress)}%</span>
                  </div>
                  <Progress value={taskProgress} aria-label={`Backend task progress ${Math.round(taskProgress)}%`} />
                </div>
              ) : null}
              <ChecklistPanel
                checklistError={checklistQuery.error}
                checklistLoading={checklistQuery.isLoading}
                items={checklist?.items ?? []}
                projectId={projectId}
                phaseId={phase.id}
                taskId={task.id}
              />
            </section>
            <CommentsSection
              comments={commentsQuery.data ?? []}
              commentsError={commentsQuery.error}
              commentsLoading={commentsQuery.isLoading}
              projectId={projectId}
              phaseId={phase.id}
              taskId={task.id}
            />
            <TaskFilesSection
              files={filesQuery.data ?? []}
              filesError={filesQuery.error}
              filesLoading={filesQuery.isLoading}
              projectId={projectId}
              phaseId={phase.id}
              taskId={task.id}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TaskFilesSection({
  files,
  filesError,
  filesLoading,
  phaseId,
  projectId,
  taskId,
}: {
  files: TaskFile[];
  filesError: Error | null;
  filesLoading: boolean;
  projectId: string;
  phaseId: string;
  taskId: string;
}) {
  const [fileInputKey, setFileInputKey] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const uploadFile = useUploadTaskFileMutation(projectId, phaseId, taskId);
  const uploadError = uploadFile.error ? fileErrorMessage(uploadFile.error) : null;
  const isUploading = uploadFile.isPending;

  async function handleUpload() {
    if (!selectedFile) {
      return;
    }

    try {
      await uploadFile.mutateAsync(selectedFile);
      setSelectedFile(null);
      setFileInputKey((key) => key + 1);
    } catch {
      return;
    }
  }

  return (
    <section className="rounded-md border bg-background p-4">
      <div className="flex items-center gap-2">
        <Paperclip className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">Files</h3>
      </div>
      <div className="mt-4 rounded-md border bg-surface p-3">
        {uploadError ? <InlineErrorMessage message={uploadError} /> : null}
        <label className="text-sm font-medium text-foreground" htmlFor={`task-file-${taskId}`}>
          Select file
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            key={fileInputKey}
            id={`task-file-${taskId}`}
            type="file"
            disabled={isUploading}
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          <Button type="button" disabled={!selectedFile || isUploading} onClick={handleUpload} className="bg-brand-red text-white hover:bg-brand-red/90">
            <Upload className="size-4" aria-hidden="true" />
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
        {selectedFile ? <p className="mt-2 text-xs text-muted-foreground">Selected: {selectedFile.name}</p> : null}
      </div>
      <div className="mt-5">
        {filesLoading ? <LoadingState label="Loading files" /> : null}
        {filesError ? <ErrorState title="Files could not be loaded" message={fileErrorMessage(filesError)} /> : null}
        {!filesLoading && !filesError && files.length === 0 ? <EmptyState title="No files attached." /> : null}
        {!filesLoading && !filesError && files.length > 0 ? (
          <div className="divide-y rounded-md border bg-surface">
            {files.map((file) => (
              <TaskFileRow key={file.id} file={file} projectId={projectId} phaseId={phaseId} taskId={taskId} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TaskFileRow({ file, phaseId, projectId, taskId }: { file: TaskFile; projectId: string; phaseId: string; taskId: string }) {
  const downloadFile = useDownloadTaskFileMutation(projectId, phaseId, taskId);
  const downloadError = downloadFile.error ? fileErrorMessage(downloadFile.error) : null;

  async function handleDownload() {
    try {
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
    } catch {
      return;
    }
  }

  return (
    <div className="px-3 py-3">
      {downloadError ? <InlineErrorMessage message={downloadError} /> : null}
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{file.file_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatFileType(file.file_type)} - {formatFileSize(file.file_size)} - Uploaded by {file.uploader_name} on {formatDateTime(file.created_at)}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={downloadFile.isPending} onClick={handleDownload} aria-label={`Download ${file.file_name}`}>
          <Download className="size-4" aria-hidden="true" />
          {downloadFile.isPending ? "Downloading..." : "Download"}
        </Button>
      </div>
    </div>
  );
}

function CommentsSection({
  comments,
  commentsError,
  commentsLoading,
  phaseId,
  projectId,
  taskId,
}: {
  comments: TaskComment[];
  commentsError: Error | null;
  commentsLoading: boolean;
  projectId: string;
  phaseId: string;
  taskId: string;
}) {
  const createComment = useCreateTaskCommentMutation(projectId, phaseId, taskId);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<CommentFormValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      comment: "",
    },
  });
  const isAdding = createComment.isPending || isSubmitting;
  const addError = createComment.error ? commentErrorMessage(createComment.error) : null;

  async function onSubmit(values: CommentFormValues) {
    try {
      await createComment.mutateAsync(values.comment.trim());
      reset();
    } catch {
      return;
    }
  }

  return (
    <section className="rounded-md border bg-background p-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-foreground">Comments</h3>
      </div>
      <form className="mt-4 space-y-2" noValidate onSubmit={handleSubmit(onSubmit)}>
        {addError ? <InlineErrorMessage message={addError} /> : null}
        <label className="sr-only" htmlFor={`task-comment-${taskId}`}>
          Add comment
        </label>
        <Textarea
          id={`task-comment-${taskId}`}
          aria-invalid={Boolean(errors.comment)}
          placeholder="Add a comment"
          disabled={isAdding}
          {...register("comment")}
        />
        {errors.comment?.message ? <p className="text-sm font-medium text-error">{errors.comment.message}</p> : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={isAdding} className="bg-brand-red text-white hover:bg-brand-red/90">
            {isAdding ? "Posting..." : "Add Comment"}
          </Button>
        </div>
      </form>
      <div className="mt-5">
        {commentsLoading ? <LoadingState label="Loading comments" /> : null}
        {commentsError ? <ErrorState title="Comments could not be loaded" message={commentErrorMessage(commentsError)} /> : null}
        {!commentsLoading && !commentsError && comments.length === 0 ? <EmptyState title="No comments yet." /> : null}
        {!commentsLoading && !commentsError && comments.length > 0 ? (
          <div className="space-y-3">
            {comments.map((comment) => (
              <article key={comment.id} className="rounded-md border bg-surface p-3">
                <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <p className="font-semibold text-foreground">{comment.author_name}</p>
                  <p className="text-muted-foreground">{formatDateTime(comment.created_at)}</p>
                </header>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{comment.comment}</p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TaskMetadata({
  phase,
  supporters,
  supportersLoading,
  task,
}: {
  phase: DashboardPhase;
  task: Task;
  supporters: { user_id: string; name: string; email: string }[];
  supportersLoading: boolean;
}) {
  return (
    <section className="rounded-md border bg-background p-4">
      <h3 className="text-sm font-semibold text-foreground">Task Information</h3>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <MetadataItem label="Phase" value={phase.name} />
        <MetadataItem label="Owner" value={task.owner_id} />
        <MetadataItem label="Start Date" value={formatOptionalDate(task.start_date)} />
        <MetadataItem label="Due Date" value={formatOptionalDate(task.due_date)} />
      </dl>
      <div className="mt-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">Supporters</p>
        {supportersLoading ? (
          <p className="mt-1 text-sm text-muted-foreground">Loading supporters...</p>
        ) : supporters.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {supporters.map((supporter) => (
              <li key={supporter.user_id} className="rounded-md border bg-surface px-2 py-1 text-xs text-foreground">
                {supporter.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">No supporters assigned.</p>
        )}
      </div>
    </section>
  );
}

function MetadataItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium text-foreground">{value}</dd>
    </div>
  );
}

function ChecklistPanel({
  checklistError,
  checklistLoading,
  items,
  phaseId,
  projectId,
  taskId,
}: {
  checklistError: Error | null;
  checklistLoading: boolean;
  items: ChecklistItem[];
  projectId: string;
  phaseId: string;
  taskId: string;
}) {
  const createItem = useCreateChecklistItemMutation(projectId, phaseId, taskId);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<ChecklistItemFormValues>({
    resolver: zodResolver(checklistItemSchema),
    defaultValues: {
      description: "",
    },
  });
  const addError = createItem.error ? checklistErrorMessage(createItem.error) : null;
  const isAdding = createItem.isPending || isSubmitting;

  async function onSubmit(values: ChecklistItemFormValues) {
    try {
      await createItem.mutateAsync({
        description: values.description.trim(),
        is_completed: false,
        display_order: nextDisplayOrder(items),
      });
      reset();
    } catch {
      return;
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <form className="space-y-2" noValidate onSubmit={handleSubmit(onSubmit)}>
        {addError ? <InlineErrorMessage message={addError} /> : null}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Input
              aria-label="New checklist item"
              aria-invalid={Boolean(errors.description)}
              placeholder="Add checklist item"
              {...register("description")}
            />
          </div>
          <Button type="submit" disabled={isAdding} className="bg-brand-red text-white hover:bg-brand-red/90">
            {isAdding ? "Adding..." : "Add"}
          </Button>
        </div>
        {errors.description?.message ? <p className="text-sm font-medium text-error">{errors.description.message}</p> : null}
      </form>
      {checklistLoading ? <LoadingState label="Loading checklist" /> : null}
      {checklistError ? <ErrorState title="Checklist could not be loaded" message={checklistErrorMessage(checklistError)} /> : null}
      {!checklistLoading && !checklistError && items.length === 0 ? <EmptyState title="No deliverables have been added yet." /> : null}
      {!checklistLoading && !checklistError && items.length > 0 ? (
        <div className="divide-y rounded-md border bg-surface">
          {items.map((item) => (
            <ChecklistItemRow key={item.id} item={item} projectId={projectId} phaseId={phaseId} taskId={taskId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function nextDisplayOrder(items: ChecklistItem[]) {
  return Math.max(0, ...items.map((item) => item.display_order)) + 1;
}

function ChecklistItemRow({ item, phaseId, projectId, taskId }: { item: ChecklistItem; projectId: string; phaseId: string; taskId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const completion = useSetChecklistItemCompletionMutation(projectId, phaseId, taskId);
  const updateItem = useUpdateChecklistItemMutation(projectId, phaseId, taskId);
  const removeItem = useRemoveChecklistItemMutation(projectId, phaseId, taskId);
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ChecklistItemFormValues>({
    resolver: zodResolver(checklistItemSchema),
    values: {
      description: item.description,
    },
  });
  const mutationError = completion.error ?? updateItem.error ?? removeItem.error;
  const pending = completion.isPending || updateItem.isPending || removeItem.isPending;

  async function onSubmit(values: ChecklistItemFormValues) {
    try {
      await updateItem.mutateAsync({ itemId: item.id, description: values.description.trim() });
      setIsEditing(false);
    } catch {
      return;
    }
  }

  return (
    <div className="px-3 py-3">
      {mutationError ? <InlineErrorMessage message={checklistErrorMessage(mutationError)} /> : null}
      <div className="flex items-start gap-3">
        <Checkbox
          checked={item.is_completed}
          disabled={pending}
          aria-label={`${item.is_completed ? "Uncheck" : "Mark complete"} ${item.description}`}
          onCheckedChange={(checked) => completion.mutate({ itemId: item.id, isCompleted: checked === true })}
        />
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <form className="flex gap-2" noValidate onSubmit={handleSubmit(onSubmit)}>
              <Input aria-label="Checklist item description" aria-invalid={Boolean(errors.description)} {...register("description")} />
              <Button type="submit" size="sm" disabled={pending}>
                <Save className="size-4" aria-hidden="true" />
                Save
              </Button>
            </form>
          ) : (
            <div>
              <p className={item.is_completed ? "text-sm font-medium text-muted-foreground line-through" : "text-sm font-medium text-foreground"}>
                {item.description}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.is_completed ? `Completed${item.completed_at ? ` ${formatDateTime(item.completed_at)}` : ""}` : "Not completed"}
              </p>
            </div>
          )}
          {errors.description?.message ? <p className="mt-1 text-sm font-medium text-error">{errors.description.message}</p> : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={() => setIsEditing((value) => !value)} aria-label={`Edit ${item.description}`}>
            <Edit className="size-4" aria-hidden="true" />
          </Button>
          <ConfirmAction
            title="Remove checklist item?"
            description="This removes the checklist item through the backend. Task progress will refresh from backend data."
            confirmLabel="Remove"
            onConfirm={() => removeItem.mutate(item.id)}
          >
            <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label={`Remove ${item.description}`}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </ConfirmAction>
        </div>
      </div>
    </div>
  );
}

function checklistErrorMessage(error: Error) {
  return userFacingErrorMessage(error, {
    action: "the checklist item",
    conflict: "The checklist change conflicts with existing data.",
    forbidden: "You do not have access to update this task.",
    notFound: "The task or checklist item could not be found.",
  });
}

function commentErrorMessage(error: Error) {
  return userFacingErrorMessage(error, {
    action: "a comment",
    forbidden: "You do not have access to comments for this task.",
    notFound: "The task or comment could not be found.",
    validation: "Please enter a comment and try again.",
  });
}

function fileErrorMessage(error: Error) {
  return userFacingErrorMessage(error, {
    action: "the selected file",
    forbidden: "You do not have access to files for this task.",
    notFound: "The task file could not be found.",
    payloadTooLarge: "The selected file is too large.",
    server: "File storage is unavailable. This may require GCS configuration.",
  });
}

function formatFileType(value: string | null) {
  if (!value) {
    return "Unknown type";
  }

  return value.split("/").pop()?.toUpperCase() || value;
}

function formatFileSize(value: number) {
  if (!Number.isFinite(value)) {
    return "Unknown size";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatOptionalDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
