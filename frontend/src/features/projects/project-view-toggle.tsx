import { Grid2X2, List } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type ProjectView = "grid" | "list";

const PROJECT_VIEW_STORAGE_KEY = "senses-project-view";

export function useProjectView(): [ProjectView, (view: ProjectView) => void] {
  const [view, setView] = useState<ProjectView>(() => {
    if (typeof window === "undefined") return "grid";
    try {
      return window.localStorage.getItem(PROJECT_VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  function updateView(nextView: ProjectView) {
    setView(nextView);
    try {
      window.localStorage.setItem(PROJECT_VIEW_STORAGE_KEY, nextView);
    } catch {
      // A blocked local storage should not prevent switching layouts.
    }
  }

  return [view, updateView];
}

export function ProjectViewToggle({ value, onChange }: { value: ProjectView; onChange: (view: ProjectView) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border bg-background p-1" aria-label="Project layout">
      <Button type="button" size="sm" variant={value === "grid" ? "default" : "ghost"} aria-pressed={value === "grid"} aria-label="Grid view" onClick={() => onChange("grid")}>
        <Grid2X2 className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Grid</span>
      </Button>
      <Button type="button" size="sm" variant={value === "list" ? "default" : "ghost"} aria-pressed={value === "list"} aria-label="List view" onClick={() => onChange("list")}>
        <List className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">List</span>
      </Button>
    </div>
  );
}
