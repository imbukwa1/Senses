import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";

import { ProjectFormDialog } from "./project-form-dialog";
import { ProjectSetupPrompt } from "./project-setup";
import { useProjectSetupQuery } from "./hooks";
import type { ProjectSummary } from "./types";

export function ProjectsHeaderActions() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [createdProject, setCreatedProject] = useState<ProjectSummary | null>(null);
  const setupQuery = useProjectSetupQuery(createdProject?.id ?? "", Boolean(createdProject));

  return (
    <>
      <ProjectFormDialog mode="create" open={open} onOpenChange={setOpen} onSaved={setCreatedProject}>
        <Button type="button" className="bg-brand-red text-white hover:bg-brand-red/90">
          <Plus className="size-4" aria-hidden="true" />
          New Project
        </Button>
      </ProjectFormDialog>
      <Dialog open={Boolean(createdProject)} onOpenChange={(nextOpen) => !nextOpen && setCreatedProject(null)}>
        <DialogContent>
          <DialogTitle className="sr-only">Project Setup</DialogTitle>
          {createdProject && setupQuery.data ? (
            <ProjectSetupPrompt
              projectName={createdProject.name}
              setup={setupQuery.data}
              onClose={() => setCreatedProject(null)}
              onContinue={() => {
                const projectId = createdProject.id;
                setCreatedProject(null);
                navigate(`/projects/${projectId}?tab=setup`);
              }}
            />
          ) : createdProject && setupQuery.isError ? (
            <div className="space-y-4">
              <ErrorState title="Project setup could not be loaded" message="The project was created and remains fully usable." />
              <Button type="button" variant="outline" onClick={() => setCreatedProject(null)}>
                Do Later
              </Button>
            </div>
          ) : createdProject ? (
            <LoadingState label="Loading project setup" />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
