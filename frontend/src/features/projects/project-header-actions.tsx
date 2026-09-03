import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { ProjectFormDialog } from "./project-form-dialog";

export function ProjectsHeaderActions() {
  const [open, setOpen] = useState(false);

  return (
    <ProjectFormDialog mode="create" open={open} onOpenChange={setOpen}>
      <Button type="button" className="bg-brand-red text-white hover:bg-brand-red/90">
        <Plus className="size-4" aria-hidden="true" />
        Add Project
      </Button>
    </ProjectFormDialog>
  );
}
