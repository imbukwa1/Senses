import { apiRequest } from "@/features/auth/api";

import type { CalendarEvent, CalendarEventPayload } from "./types";

export function listCalendarEvents(token: string) {
  return apiRequest<CalendarEvent[]>("/calendar/events", {}, token);
}

export function createCalendarEvent(token: string, payload: CalendarEventPayload) {
  return apiRequest<CalendarEvent>("/calendar/events", { method: "POST", body: JSON.stringify(payload) }, token);
}

export function updateCalendarEvent(token: string, eventId: string, payload: CalendarEventPayload) {
  return apiRequest<CalendarEvent>(`/calendar/events/${eventId}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
}

export function deleteCalendarEvent(token: string, eventId: string) {
  return apiRequest<void>(`/calendar/events/${eventId}`, { method: "DELETE" }, token);
}
