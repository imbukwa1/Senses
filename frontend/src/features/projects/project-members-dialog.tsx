import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ConfirmAction } from "@/components/common/confirm-action";
import { ErrorState, InlineErrorMessage } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { userFacingErrorMessage } from "@/lib/api-errors";

import { useAddProjectMemberMutation, useProjectMembersQuery, useRemoveProjectMemberMutation } from "./hooks";
import type { ProjectMember, ProjectSummary } from "./types";

const addMemberSchema = z.object({
  user_id: z.uuid("Enter a valid registered user ID."),
});

type AddMemberValues = z.infer<typeof addMemberSchema>;

type ProjectMembersDialogProps = {
  project: ProjectSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function ProjectMembersDialog({ children, onOpenChange, open, project }: ProjectMembersDialogProps) {
  const membersQuery = useProjectMembersQuery(project.id, open);
  const addMember = useAddProjectMemberMutation(project.id);
  const removeMember = useRemoveProjectMemberMutation(project.id);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<AddMemberValues>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      user_id: "",
    },
  });
  const userIdValue = watch("user_id");
  const isAdding = addMember.isPending || isSubmitting;
  const existingMember = membersQuery.data?.some((member) => member.user_id === userIdValue);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      addMember.reset();
      removeMember.reset();
      reset();
    }
    onOpenChange(nextOpen);
  }

  async function onSubmit(values: AddMemberValues) {
    if (membersQuery.data?.some((member) => member.user_id === values.user_id)) {
      return;
    }

    try {
      await addMember.mutateAsync(values.user_id);
      reset();
    } catch {
      return;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project Members</DialogTitle>
          <DialogDescription>Manage project access for {project.code}. Membership is separate from ownership.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserPlus className="size-4 text-primary" aria-hidden="true" />
              Add Member
            </div>
            <form className="mt-3 space-y-2" noValidate onSubmit={handleSubmit(onSubmit)}>
              {addMember.error ? <InlineErrorMessage message={memberErrorMessage(addMember.error)} /> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`add-member-${project.id}`}>
                    Registered User ID
                  </label>
                  <Input
                    id={`add-member-${project.id}`}
                    aria-invalid={Boolean(errors.user_id) || Boolean(existingMember)}
                    placeholder="Registered User ID"
                    disabled={isAdding || membersQuery.isLoading}
                    {...register("user_id")}
                  />
                </div>
                <Button type="submit" disabled={isAdding || membersQuery.isLoading || Boolean(existingMember)}>
                  {isAdding ? "Adding..." : "Add"}
                </Button>
              </div>
              {errors.user_id?.message ? <p className="text-sm font-medium text-error">{errors.user_id.message}</p> : null}
              {existingMember ? <p className="text-sm font-medium text-muted-foreground">This user is already a project member.</p> : null}
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              User lookup is not available yet, so adding a member requires the registered user's backend ID.
            </p>
          </div>
          {membersQuery.isLoading ? <LoadingState label="Loading project members" /> : null}
          {membersQuery.isError ? <ErrorState title="Members could not be loaded" message={memberErrorMessage(membersQuery.error)} /> : null}
          {removeMember.error ? <InlineErrorMessage message={memberErrorMessage(removeMember.error)} /> : null}
          {membersQuery.data ? (
            <div className="divide-y rounded-md border bg-surface">
              {membersQuery.data.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No members found.</p>
              ) : (
                membersQuery.data.map((member) => (
                  <MemberRow
                    key={member.user_id}
                    member={member}
                    isRemoving={removeMember.isPending}
                    onRemove={() => removeMember.mutate(member.user_id)}
                  />
                ))
              )}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({ isRemoving, member, onRemove }: { member: ProjectMember; isRemoving: boolean; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <Avatar>
        <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>
      <ConfirmAction
        title="Remove project member?"
        description="This removes project access for the selected member. Ownership assignments are separate and remain governed by the backend."
        confirmLabel="Remove"
        onConfirm={onRemove}
      >
        <Button type="button" variant="ghost" size="icon" disabled={isRemoving} aria-label={`Remove ${member.name}`}>
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </ConfirmAction>
    </div>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}

function memberErrorMessage(error: Error | null) {
  return userFacingErrorMessage(error, {
    action: "the selected member",
    conflict: "The member change conflicts with existing data.",
    forbidden: "You do not have access to manage members for this project.",
    notFound: "The project or member could not be found.",
  });
}
