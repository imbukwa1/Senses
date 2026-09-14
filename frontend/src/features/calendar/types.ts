export type CalendarEventColor = "blue" | "green" | "red" | "amber" | "purple" | "teal";

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  color: CalendarEventColor;
  created_by: string;
  creator_name: string;
  created_at: string;
  updated_at: string;
};

export type CalendarEventPayload = Omit<Pick<CalendarEvent, "title" | "description" | "start_at" | "end_at" | "all_day" | "color">, never>;
