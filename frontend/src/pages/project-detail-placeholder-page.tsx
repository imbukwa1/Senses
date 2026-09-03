import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";

export function ProjectDetailPlaceholderPage() {
  const { projectId } = useParams();

  return (
    <section className="rounded-md border bg-surface p-6 shadow-soft">
      <h2 className="text-base font-semibold text-foreground">Project dashboard placeholder</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Project route prepared for backend project ID {projectId}. Dashboard content belongs to a later frontend section.
      </p>
      <Button asChild variant="outline" className="mt-5">
        <Link to="/projects">Back to Projects</Link>
      </Button>
    </section>
  );
}
