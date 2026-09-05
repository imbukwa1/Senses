import { Badge } from "@/components/ui/badge";

export const projectHealthValues = ["Active", "At Risk", "Delayed", "Completed"] as const;
export type ProjectHealth = (typeof projectHealthValues)[number];
export const projectHealthLabelValues = ["On track", "Needs attention", "At risk", "Completed"] as const;
export type ProjectHealthLabel = (typeof projectHealthLabelValues)[number];

const healthClasses: Record<ProjectHealthLabel, string> = {
  "On track": "bg-health-active/10 text-health-active",
  "Needs attention": "bg-health-at-risk/15 text-foreground",
  "At risk": "bg-health-delayed/10 text-health-delayed",
  Completed: "bg-health-completed/10 text-health-completed",
};

export function projectHealthLabel(value: ProjectHealth): ProjectHealthLabel {
  if (value === "Active") {
    return "On track";
  }
  if (value === "At Risk") {
    return "Needs attention";
  }
  if (value === "Delayed") {
    return "At risk";
  }
  return "Completed";
}

export function HealthBadge({ label, value }: { value?: ProjectHealth; label?: ProjectHealthLabel }) {
  const displayLabel = label ?? (value ? projectHealthLabel(value) : "On track");

  return (
    <Badge variant="outline" className={healthClasses[displayLabel]}>
      {displayLabel}
    </Badge>
  );
}
