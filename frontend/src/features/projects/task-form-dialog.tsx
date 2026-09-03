import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { DateInput } from "@/components/common/date-input";
import { InlineErrorMessage } from "@/components/common/error-state";
import { FormField } from "@/components/common/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/features/auth/api";

import { useCreateTaskMutation, useProjectMembersQuery, useTaskSupportersQuery, useUpdateTaskMutation } from "./hooks";
import type { DashboardPhase, ProjectMember, Task, TaskMutationPayload, TaskSupporter } from "./types";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const optionalDateSchema = z.string().refine((value) => !value || datePattern.test(value), "Enter a valid date.");

const taskFormSchema = z.object({
  name: z.string().trim().min(1, "Task name is required.").max(200, "Task name must be 200 characters or fewer."),
  description: z.string().trim().optional(),
  owner_id: z.uuid("Select a task owner."),
  priority: z.enum(["Low", "Medium", "High"]),
  status: z.enum(["Not Started", "In Progress", "Blocked", "Completed"]),
  start_date: optionalDateSchema,
  due_date: optionalDateSchema,
  supporter_ids: z.array(z.uuid()),
});

type TaskFormValues = z.infer<typeof taskFormSchema>;
type UserOption = {
  value: string;
  label: string;
  name: string;
  email?: string;
};

type TaskFormDialogProps = {
  children: React.ReactNode;
  mode: "create" | "edit";
  projectId: string;
  phase: DashboardPhase;
  task?: Task;
};

export function TaskFormDialog({ children, mode, phase, projectId, task }: TaskFormDialogProps) {
  const [open, setOpen] = useState(false);
  const membersQuery = useProjectMembersQuery(projectId, open);
  const supportersQuery = useTaskSupportersQuery(projectId, phase.id, task?.id ?? "", open && Boolean(task));
  const createTask = useCreateTaskMutation(projectId, phase.id);
  const updateTask = useUpdateTaskMutation(projectId, phase.id, task?.id ?? "");
  const mutation = mode === "create" ? createTask : updateTask;
  const memberOptions = buildUserOptions(membersQuery.data ?? [], task, supportersQuery.data ?? []);
  const supporterIds = supportersQuery.data?.map((supporter) => supporter.user_id) ?? [];
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    values: taskToFormValues(task, memberOptions, supporterIds),
  });
  const selectedSupporters = watch("supporter_ids");
  const serverError = mutation.error ? taskMutationErrorMessage(mutation.error) : null;
  const isPending = mutation.isPending || isSubmitting;
  const isLoadingUsers = membersQuery.isLoading || supportersQuery.isLoading;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      mutation.reset();
      reset(taskToFormValues(task, memberOptions, supporterIds));
    }
    setOpen(nextOpen);
  }

  async function onSubmit(values: TaskFormValues) {
    try {
      const payload = toPayload(values);
      if (mode === "create") {
        await createTask.mutateAsync({ payload, supporterIds: values.supporter_ids });
      } else {
        await updateTask.mutateAsync({
          payload,
          supporterIds: values.supporter_ids,
          currentSupporterIds: supporterIds,
        });
      }
      setOpen(false);
    } catch {
      return;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Task" : "Edit Task"}</DialogTitle>
          <DialogDescription>
            Project context comes from the current dashboard. Task association is made through phase {phase.name}.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" noValidate onSubmit={handleSubmit(onSubmit)}>
          {serverError ? <InlineErrorMessage message={serverError} /> : null}
          {membersQuery.error ? <InlineErrorMessage message="Project members could not be loaded for owner/supporter selection." /> : null}
          <div className="rounded-md border bg-background px-3 py-2 text-sm">
            <span className="font-medium text-foreground">Phase:</span> <span className="text-muted-foreground">{phase.name}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Task Name" error={errors.name?.message} required className="md:col-span-2">
              {({ describedBy, id, invalid }) => (
                <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register("name")} />
              )}
            </FormField>
            <FormField label="Description" error={errors.description?.message} className="md:col-span-2">
              {({ describedBy, id, invalid }) => (
                <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register("description")} />
              )}
            </FormField>
            <FormField
              label="Owner"
              error={errors.owner_id?.message}
              description="Owner choices use existing project members because no general user lookup endpoint exists."
              required
            >
              {() => (
                <Controller
                  control={control}
                  name="owner_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={isLoadingUsers || memberOptions.length === 0}>
                      <SelectTrigger aria-label="Owner">
                        <SelectValue placeholder={isLoadingUsers ? "Loading members" : "Select owner"} />
                      </SelectTrigger>
                      <SelectContent>
                        {memberOptions.map((member) => (
                          <SelectItem key={member.value} value={member.value}>
                            {member.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField label="Priority" error={errors.priority?.message} required>
              {() => (
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Priority">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Low", "Medium", "High"].map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {priority}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField label="Status" error={errors.status?.message} required>
              {() => (
                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Not Started", "In Progress", "Blocked", "Completed"].map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField label="Start Date" error={errors.start_date?.message}>
              {({ describedBy, id, invalid }) => (
                <DateInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register("start_date")} />
              )}
            </FormField>
            <FormField label="Due Date" error={errors.due_date?.message}>
              {({ describedBy, id, invalid }) => (
                <DateInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register("due_date")} />
              )}
            </FormField>
            <FormField label="Supporters" error={errors.supporter_ids?.message} className="md:col-span-2">
              {() => (
                <Controller
                  control={control}
                  name="supporter_ids"
                  render={({ field }) => (
                    <div className="max-h-48 overflow-y-auto rounded-md border bg-background p-2">
                      {memberOptions.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-muted-foreground">No project members available.</p>
                      ) : (
                        memberOptions.map((member) => (
                          <SupporterOption
                            key={member.value}
                            member={member}
                            checked={field.value.includes(member.value)}
                            onCheckedChange={(checked) => {
                              field.onChange(toggleSupporter(field.value, member.value, checked));
                            }}
                          />
                        ))
                      )}
                    </div>
                  )}
                />
              )}
            </FormField>
          </div>
          {selectedSupporters.length > 0 ? <p className="text-xs text-muted-foreground">{selectedSupporters.length} supporter(s) selected.</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending || isLoadingUsers || memberOptions.length === 0} className="bg-brand-red text-white hover:bg-brand-red/90">
              <Save className="size-4" aria-hidden="true" />
              {isPending ? "Saving..." : mode === "create" ? "Add Task" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SupporterOption({
  checked,
  member,
  onCheckedChange,
}: {
  member: UserOption;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{member.name}</span>
        {member.email ? <span className="block truncate text-xs text-muted-foreground">{member.email}</span> : null}
      </span>
    </label>
  );
}

function taskToFormValues(task: Task | undefined, members: UserOption[], supporterIds: string[]): TaskFormValues {
  return {
    name: task?.name ?? "",
    description: task?.description ?? "",
    owner_id: task?.owner_id || members[0]?.value || "",
    priority: task?.priority ?? "Medium",
    status: task?.status ?? "Not Started",
    start_date: task?.start_date ?? "",
    due_date: task?.due_date ?? "",
    supporter_ids: supporterIds,
  };
}

function buildUserOptions(members: ProjectMember[], task: Task | undefined, supporters: TaskSupporter[]) {
  const options: UserOption[] = members.map((member) => ({
    value: member.user_id,
    label: `${member.name} (${member.email})`,
    name: member.name,
    email: member.email,
  }));

  if (task?.owner_id && !options.some((option) => option.value === task.owner_id)) {
    options.push({
      value: task.owner_id,
      label: `Current owner (${task.owner_id})`,
      name: "Current owner",
    });
  }

  for (const supporter of supporters) {
    if (!options.some((option) => option.value === supporter.user_id)) {
      options.push({
        value: supporter.user_id,
        label: `${supporter.name} (${supporter.email})`,
        name: supporter.name,
        email: supporter.email,
      });
    }
  }

  return options;
}

function toPayload(values: TaskFormValues): TaskMutationPayload {
  return {
    name: values.name.trim(),
    description: blankToNull(values.description),
    owner_id: values.owner_id,
    priority: values.priority,
    status: values.status,
    start_date: blankToNull(values.start_date),
    due_date: blankToNull(values.due_date),
  };
}

function toggleSupporter(current: string[], userId: string, checked: boolean) {
  if (checked) {
    return [...new Set([...current, userId])];
  }

  return current.filter((id) => id !== userId);
}

function blankToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function taskMutationErrorMessage(error: Error) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "You do not have access to manage tasks for this project.";
    }
    if (error.status === 404) {
      return "The project, phase, task, owner, or supporter could not be found.";
    }
    if (error.status === 409) {
      return "The supporter is already assigned to this task.";
    }
    if (error.status === 422 || error.status === 400) {
      return "Please check the task details and try again.";
    }

    return error.message;
  }

  return "The task could not be saved. Please try again.";
}
