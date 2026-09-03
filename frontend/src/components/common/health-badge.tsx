import { Badge } from "@/components/ui/badge";

export const projectHealthValues = ["Active", "At Risk", "Delayed", "Completed"] as const;
export type ProjectHealth = (typeof projectHealthValues)[number];

const healthClasses: Record<ProjectHealth, string> = {
  Active: "bg-health-active/10 text-health-active",
  "At Risk": "bg-health-at-risk/15 text-foreground",
  Delayed: "bg-health-delayed/10 text-health-delayed",
  Completed: "bg-health-completed/10 text-health-completed",
};

export function HealthBadge({ value }: { value: ProjectHealth }) {
  return (
    <Badge variant="outline" className={healthClasses[value]}>
      {value}
    </Badge>
  );
}
