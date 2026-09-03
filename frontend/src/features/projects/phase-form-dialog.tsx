import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { DateInput } from "@/components/common/date-input";
import { InlineErrorMessage } from "@/components/common/error-state";
import { FormField } from "@/components/common/form-field";
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
import { useAuth } from "@/features/auth/hooks";

import { useCreatePhaseMutation, useUpdatePhaseMutation } from "./hooks";
import type { DashboardPhase, PhaseMutationPayload } from "./types";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const optionalDateSchema = z.string().refine((value) => !value || datePattern.test(value), "Enter a valid date.");
const optionalOwnerSchema = z.union([z.uuid(), z.literal("")]);

const phaseFormSchema = z.object({
  name: z.string().trim().min(1, "Phase name is required.").max(200, "Phase name must be 200 characters or fewer."),
  description: z.string().trim().optional(),
  owner_id: optionalOwnerSchema,
  start_date: optionalDateSchema,
  end_date: optionalDateSchema,
  status: z.enum(["Not Started", "In Progress", "Completed"]),
  display_order: z.number().int().positive(),
  objectives: z.string().trim().optional(),
});

type PhaseFormValues = z.infer<typeof phaseFormSchema>;

type PhaseFormDialogProps = {
  children: React.ReactNode;
  mode: "create" | "edit";
  projectId: string;
  nextDisplayOrder: number;
  phase?: DashboardPhase;
};

export function PhaseFormDialog({ children, mode, nextDisplayOrder, phase, projectId }: PhaseFormDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const createPhase = useCreatePhaseMutation(projectId);
  const updatePhase = useUpdatePhaseMutation(projectId, phase?.id ?? "");
  const mutation = mode === "create" ? createPhase : updatePhase;
  const ownerOptions = buildOwnerOptions(user, phase);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<PhaseFormValues>({
    resolver: zodResolver(phaseFormSchema),
    values: phaseToFormValues(phase, nextDisplayOrder),
  });
  const serverError = mutation.error ? phaseMutationErrorMessage(mutation.error) : null;
  const isPending = mutation.isPending || isSubmitting;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      mutation.reset();
      reset(phaseToFormValues(phase, nextDisplayOrder));
    }
    setOpen(nextOpen);
  }

  async function onSubmit(values: PhaseFormValues) {
    try {
      await mutation.mutateAsync(toPayload(values));
      reset(phaseToFormValues(phase, nextDisplayOrder));
      setOpen(false);
    } catch {
      return;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add Phase" : "Edit Phase"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Create a phase for this project." : "Update phase details, including the phase name."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" noValidate onSubmit={handleSubmit(onSubmit)}>
          {serverError ? <InlineErrorMessage message={serverError} /> : null}
          <input type="hidden" {...register("display_order", { valueAsNumber: true })} />
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label="Phase Name" error={errors.name?.message} required className="md:col-span-2">
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
              description="User lookup is not available from the backend yet; owner choices are limited to users already known to this screen."
            >
              {() => (
                <Controller
                  control={control}
                  name="owner_id"
                  render={({ field }) => (
                    <Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)}>
                      <SelectTrigger aria-label="Owner">
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No owner</SelectItem>
                        {ownerOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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
                        {["Not Started", "In Progress", "Completed"].map((status) => (
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
            <FormField label="End Date" error={errors.end_date?.message}>
              {({ describedBy, id, invalid }) => (
                <DateInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register("end_date")} />
              )}
            </FormField>
            <FormField label="Objectives" error={errors.objectives?.message} className="md:col-span-2">
              {({ describedBy, id, invalid }) => (
                <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register("objectives")} />
              )}
            </FormField>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending} className="bg-brand-red text-white hover:bg-brand-red/90">
              <Save className="size-4" aria-hidden="true" />
              {isPending ? "Saving..." : mode === "create" ? "Add Phase" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function phaseToFormValues(phase: DashboardPhase | undefined, nextDisplayOrder: number): PhaseFormValues {
  return {
    name: phase?.name ?? "",
    description: phase?.description ?? "",
    owner_id: phase?.owner_id ?? "",
    start_date: phase?.start_date ?? "",
    end_date: phase?.end_date ?? "",
    status: phase?.status ?? "Not Started",
    display_order: phase?.display_order ?? nextDisplayOrder,
    objectives: phase?.objectives ?? "",
  };
}

function toPayload(values: PhaseFormValues): PhaseMutationPayload {
  return {
    name: values.name.trim(),
    description: blankToNull(values.description),
    owner_id: values.owner_id || null,
    start_date: blankToNull(values.start_date),
    end_date: blankToNull(values.end_date),
    status: values.status,
    display_order: values.display_order,
    objectives: blankToNull(values.objectives),
  };
}

function buildOwnerOptions(user: ReturnType<typeof useAuth>["user"], phase: DashboardPhase | undefined) {
  const options = [];

  if (user) {
    options.push({ label: `${user.name} (${user.email})`, value: user.id });
  }

  if (phase?.owner_id && !options.some((option) => option.value === phase.owner_id)) {
    options.push({ label: `Current owner (${phase.owner_id})`, value: phase.owner_id });
  }

  return options;
}

function blankToNull(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function phaseMutationErrorMessage(error: Error) {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return "You do not have access to manage phases for this project.";
    }
    if (error.status === 404) {
      return "The project, phase, or selected owner could not be found.";
    }
    if (error.status === 409) {
      return "The phase could not be saved because it conflicts with existing data.";
    }
    if (error.status === 422 || error.status === 400) {
      return "Please check the phase details and try again.";
    }

    return error.message;
  }

  return "The phase could not be saved. Please try again.";
}
