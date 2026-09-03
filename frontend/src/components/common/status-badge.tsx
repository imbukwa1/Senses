import { Badge, type BadgeProps } from "@/components/ui/badge";

export const projectStatuses = ["Planning", "Not Started", "Active", "On Hold", "Completed"] as const;
export const phaseStatuses = ["Not Started", "In Progress", "Completed"] as const;
export const taskStatuses = ["Not Started", "In Progress", "Blocked", "Completed"] as const;
export const priorities = ["Low", "Medium", "High"] as const;

export type ProjectStatus = (typeof projectStatuses)[number];
export type PhaseStatus = (typeof phaseStatuses)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type Priority = (typeof priorities)[number];

type StatusBadgeProps = {
  value: ProjectStatus | PhaseStatus | TaskStatus | Priority;
};

const variants: Record<StatusBadgeProps["value"], BadgeProps["variant"]> = {
  Planning: "info",
  "Not Started": "secondary",
  Active: "success",
  "On Hold": "warning",
  Completed: "success",
  "In Progress": "info",
  Blocked: "error",
  Low: "secondary",
  Medium: "info",
  High: "error",
};

export function StatusBadge({ value }: StatusBadgeProps) {
  return <Badge variant={variants[value]}>{value}</Badge>;
}
