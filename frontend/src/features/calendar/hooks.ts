import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/features/auth/api";
import { useAuth } from "@/features/auth/hooks";

import { createCalendarEvent, deleteCalendarEvent, listCalendarEvents, updateCalendarEvent } from "./api";
import type { CalendarEventPayload } from "./types";

export const calendarEventsQueryKey = ["calendar", "events"] as const;

function requireToken(token: string | null) {
  if (!token) throw new Error("Authentication is required");
  return token;
}

function authFailureHandler(logout: () => void) {
  return (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) logout();
  };
}

export function useCalendarEventsQuery() {
  const { token } = useAuth();
  return useQuery({
    queryKey: calendarEventsQueryKey,
    queryFn: () => listCalendarEvents(requireToken(token)),
    enabled: Boolean(token),
  });
}

export function useCreateCalendarEventMutation() {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();
  return useMutation({
    mutationFn: (payload: CalendarEventPayload) => createCalendarEvent(requireToken(token), payload),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: calendarEventsQueryKey }); },
    onError: authFailureHandler(logout),
  });
}

export function useUpdateCalendarEventMutation() {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();
  return useMutation({
    mutationFn: ({ eventId, payload }: { eventId: string; payload: CalendarEventPayload }) => updateCalendarEvent(requireToken(token), eventId, payload),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: calendarEventsQueryKey }); },
    onError: authFailureHandler(logout),
  });
}

export function useDeleteCalendarEventMutation() {
  const queryClient = useQueryClient();
  const { logout, token } = useAuth();
  return useMutation({
    mutationFn: (eventId: string) => deleteCalendarEvent(requireToken(token), eventId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: calendarEventsQueryKey }); },
    onError: authFailureHandler(logout),
  });
}
