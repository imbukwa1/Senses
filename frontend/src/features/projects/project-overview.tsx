import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HealthBadge } from "@/components/common/health-badge";
import { MetadataRow } from "@/components/common/metadata-row";
import { StatusBadge } from "@/components/common/status-badge";

import type { ProjectOverview } from "./types";

export function ProjectOverviewPage({ project }: { project: ProjectOverview }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">{project.code}</Badge>
            <Badge variant="secondary">View only</Badge>
            <StatusBadge value={project.status} />
          </div>
          <CardTitle className="mt-3 text-2xl">{project.name}</CardTitle>
          <CardDescription>{project.description || "No project description has been provided."}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            <MetadataRow label="Project Lead" value={`${project.project_lead.name} (${project.project_lead.email})`} />
            <MetadataRow label="Dates" value={`${formatDate(project.start_date)} - ${formatDate(project.end_date)}`} />
            <MetadataRow label="Health" value={<HealthBadge label={project.health_label} />} />
            {project.project_location_area ? <MetadataRow label="Location" value={project.project_location_area} /> : null}
          </dl>
        </CardContent>
      </Card>

      <OverviewTextSection title="Objectives" value={project.objectives} />
      <OverviewTextSection title="Expected Outcomes" value={project.expected_outcomes} />
      <OverviewTextSection title="Success Criteria" value={project.success_criteria} />
      <OverviewTextSection title="Scope" value={scopeSummary(project)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Phases</CardTitle>
          <CardDescription>Overview of the project phases.</CardDescription>
        </CardHeader>
        <CardContent>
          {project.phases.length > 0 ? (
            <div className="divide-y rounded-md border">
              {project.phases.map((phase) => (
                <div key={phase.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div>
                    <p className="font-medium">{phase.name}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(phase.start_date)} - {formatDate(phase.end_date)}</p>
                  </div>
                  <Badge variant="secondary">{phase.status}</Badge>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted-foreground">No phases have been recorded.</p>}
        </CardContent>
      </Card>

      {project.milestones.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Milestones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.milestones.map((milestone) => (
              <div key={milestone.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div>
                  <p className="font-medium">{milestone.name}</p>
                  <p className="text-sm text-muted-foreground">Target date: {formatDate(milestone.target_date)}</p>
                  {milestone.responsible_person ? <p className="text-sm text-muted-foreground">Responsible: {milestone.responsible_person.name}</p> : null}
                </div>
                <Badge variant="secondary">{milestone.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function OverviewTextSection({ title, value }: { title: string; value: string | null }) {
  if (!value) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader>
      <CardContent><p className="whitespace-pre-wrap text-sm text-muted-foreground">{value}</p></CardContent>
    </Card>
  );
}

function scopeSummary(project: ProjectOverview) {
  return [
    project.scope_in ? `In scope: ${project.scope_in}` : null,
    project.scope_out ? `Out of scope: ${project.scope_out}` : null,
    project.scope_boundaries ? `Boundaries: ${project.scope_boundaries}` : null,
    project.scope_notes ? `Notes: ${project.scope_notes}` : null,
  ].filter(Boolean).join("\n\n") || null;
}

function formatDate(value: string | null) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
