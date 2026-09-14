import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { userFacingErrorMessage } from "@/lib/api-errors";

import { useCalendarEventsQuery, useCreateCalendarEventMutation, useDeleteCalendarEventMutation, useUpdateCalendarEventMutation } from "@/features/calendar/hooks";
import type { CalendarEvent, CalendarEventColor, CalendarEventPayload } from "@/features/calendar/types";

type CalendarView = "month" | "week" | "day";
const COLORS: { value: CalendarEventColor; label: string; className: string }[] = [
  { value: "blue", label: "Blue", className: "bg-blue-500" },
  { value: "green", label: "Green", className: "bg-green-600" },
  { value: "red", label: "Red", className: "bg-red-500" },
  { value: "amber", label: "Amber", className: "bg-amber-500" },
  { value: "purple", label: "Purple", className: "bg-purple-600" },
  { value: "teal", label: "Teal", className: "bg-teal-600" },
];

export function TeamCalendarPage() {
  const query = useCalendarEventsQuery();
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [editing, setEditing] = useState<CalendarEvent | null | undefined>(undefined);

  if (query.isLoading) return <LoadingState label="Loading team calendar" />;
  if (query.isError) return <ErrorState title="Team Calendar could not be loaded" message={userFacingErrorMessage(query.error)} />;

  const events = query.data ?? [];
  const periodLabel = view === "month" ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : view === "week" ? weekLabel(anchor) : anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Previous period" onClick={() => setAnchor(movePeriod(anchor, view, -1))}><ChevronLeft className="size-4" aria-hidden="true" /></Button>
          <Button type="button" variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
          <Button type="button" variant="outline" size="icon" aria-label="Next period" onClick={() => setAnchor(movePeriod(anchor, view, 1))}><ChevronRight className="size-4" aria-hidden="true" /></Button>
          <h2 className="ml-2 text-lg font-semibold text-foreground">{periodLabel}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-surface p-1" role="group" aria-label="Calendar view">
            {(["month", "week", "day"] as CalendarView[]).map((option) => <Button key={option} type="button" variant={view === option ? "secondary" : "ghost"} size="sm" onClick={() => setView(option)}>{option[0].toUpperCase() + option.slice(1)}</Button>)}
          </div>
          <Button type="button" onClick={() => setEditing(null)}><Plus className="size-4" aria-hidden="true" />New Event</Button>
        </div>
      </div>
      {view === "month" ? <MonthView anchor={anchor} events={events} onSelect={setEditing} /> : null}
      {view === "week" ? <WeekView anchor={anchor} events={events} onSelect={setEditing} /> : null}
      {view === "day" ? <DayView anchor={anchor} events={events} onSelect={setEditing} /> : null}
      {events.length === 0 ? <p className="text-center text-sm text-muted-foreground" role="status">No events scheduled</p> : null}
      <EventDialog event={editing} onClose={() => setEditing(undefined)} />
    </section>
  );
}

function MonthView({ anchor, events, onSelect }: { anchor: Date; events: CalendarEvent[]; onSelect: (event: CalendarEvent) => void }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = new Date(first); gridStart.setDate(first.getDate() - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(gridStart); day.setDate(gridStart.getDate() + index); return day; });
  return <CalendarFrame columns={7} headings={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}>{days.map((day) => <DayCell key={dateKey(day)} day={day} muted={day.getMonth() !== anchor.getMonth()} events={eventsForDay(events, day)} onSelect={onSelect} />)}</CalendarFrame>;
}

function WeekView({ anchor, events, onSelect }: { anchor: Date; events: CalendarEvent[]; onSelect: (event: CalendarEvent) => void }) {
  const start = new Date(anchor); start.setDate(anchor.getDate() - anchor.getDay());
  const days = Array.from({ length: 7 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  return <CalendarFrame columns={7} scroll headings={days.map((day) => day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }))}>{days.map((day) => <DayCell key={dateKey(day)} day={day} events={eventsForDay(events, day)} onSelect={onSelect} overlap />)}</CalendarFrame>;
}

function DayView({ anchor, events, onSelect }: { anchor: Date; events: CalendarEvent[]; onSelect: (event: CalendarEvent) => void }) {
  return <CalendarFrame columns={1} scroll headings={[anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })]}><DayCell day={anchor} events={eventsForDay(events, anchor)} onSelect={onSelect} overlap /></CalendarFrame>;
}

function CalendarFrame({ columns, headings, children, scroll = false }: { columns: number; headings: string[]; children: ReactNode; scroll?: boolean }) {
  return <Card><CardHeader><CardTitle className="sr-only">Team Calendar</CardTitle></CardHeader><CardContent className="p-0"><div className="grid border-b" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{headings.map((heading) => <div key={heading} className="border-r p-2 text-center text-xs font-medium text-muted-foreground last:border-r-0">{heading}</div>)}</div><div className={`grid ${scroll ? "max-h-[calc(100vh-14rem)] overflow-y-auto" : ""}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{children}</div></CardContent></Card>;
}

function DayCell({ day, muted = false, events, onSelect, overlap = false }: { day: Date; muted?: boolean; events: CalendarEvent[]; onSelect: (event: CalendarEvent) => void; overlap?: boolean }) {
  const today = dateKey(day) === dateKey(new Date());
  const layout = overlap ? overlapLayout(events) : new Map(events.map((event) => [event.id, { column: 1, columns: 1 }]));
  const columnCount = Math.max(1, ...Array.from(layout.values()).map((item) => item.columns));
  return <div className={`min-h-32 border-b border-r p-2 last:border-r-0 ${muted ? "bg-muted/20" : "bg-background"} ${today ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""}`}><p className={`mb-2 flex items-center gap-1 text-xs font-medium ${muted ? "text-muted-foreground/60" : "text-muted-foreground"}`}>{day.getDate()}{today ? <span className="rounded bg-primary px-1 py-0.5 text-[10px] text-primary-foreground">Today</span> : null}</p><div className={overlap ? "grid items-start gap-1" : "space-y-1"} style={overlap ? { gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` } : undefined}>{events.map((event) => { const placement = layout.get(event.id) ?? { column: 1, columns: 1 }; return <button key={event.id} type="button" className={`block min-w-0 w-full truncate rounded px-2 py-1 text-left text-xs font-medium text-white ${colorClass(event)}`} style={overlap ? { gridColumn: placement.column } : undefined} onClick={() => onSelect(event)}>{event.all_day ? event.title : `${formatTime(event.start_at)} ${event.title}`}</button>; })}</div></div>;
}

function EventDialog({ event, onClose }: { event: CalendarEvent | null | undefined; onClose: () => void }) {
  const create = useCreateCalendarEventMutation();
  const update = useUpdateCalendarEventMutation();
  const remove = useDeleteCalendarEventMutation();
  const [form, setForm] = useState(() => eventForm(event));
  useEffect(() => setForm(eventForm(event)), [event]);
  const isOpen = event !== undefined;
  const pending = create.isPending || update.isPending || remove.isPending;

  if (event?.source_type === "work_plan") {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Work Plan Activity</DialogTitle>
            <DialogDescription>{event.project_name}{event.phase_name ? ` · ${event.phase_name}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium text-foreground">{event.title}</p>
            {event.description ? <p className="whitespace-pre-wrap text-muted-foreground">{event.description}</p> : null}
            <p className="text-muted-foreground">{formatDateRange(event.start_at, event.end_at)}</p>
          </div>
          {event.project_id ? <Link className="text-sm font-medium text-primary hover:underline" to={`/projects/${event.project_id}?tab=setup&section=work_plan`}>Open Work Plan</Link> : null}
        </DialogContent>
      </Dialog>
    );
  }

  async function save() {
    const payload = toPayload(form);
    if (event) {
      await update.mutateAsync({ eventId: event.id, payload });
    } else {
      await create.mutateAsync(payload);
    }
    onClose();
  }

  async function deleteEvent() {
    if (event) {
      await remove.mutateAsync(event.id);
      onClose();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="calendar-title">Title</Label><Input id="calendar-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="calendar-description">Description</Label><Textarea id="calendar-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="calendar-start">Starts</Label><Input id="calendar-start" type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="calendar-end">Ends</Label><Input id="calendar-end" type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.all_day} onChange={(e) => setForm({ ...form, all_day: e.target.checked })} />All day</label>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((color) => <button key={color.value} type="button" aria-label={color.label} className={`size-7 rounded-full ${color.className} ${form.color === color.value ? "ring-2 ring-ring ring-offset-2" : ""}`} onClick={() => setForm({ ...form, color: color.value })} />)}
            </div>
          </div>
        </div>
        <DialogFooter>
          {event ? <Button type="button" variant="ghost" className="mr-auto text-error" disabled={pending} onClick={() => void deleteEvent()}><Trash2 className="size-4" aria-hidden="true" />Delete</Button> : null}
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={pending || !form.title.trim()} onClick={() => void save()}>{pending ? "Saving..." : "Save"}</Button>
        </DialogFooter>
        {create.error || update.error || remove.error ? <p className="text-sm text-error">{userFacingErrorMessage((create.error || update.error || remove.error) as Error)}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

function eventForm(event: CalendarEvent | null | undefined) { return { title: event?.title ?? "", description: event?.description ?? "", start_at: toLocalInput(event?.start_at ?? new Date().toISOString()), end_at: toLocalInput(event?.end_at ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()), all_day: event?.all_day ?? false, color: event?.color ?? "blue" as CalendarEventColor }; }
function toPayload(form: ReturnType<typeof eventForm>): CalendarEventPayload { return { ...form, description: form.description.trim() || null, start_at: new Date(form.start_at).toISOString(), end_at: new Date(form.end_at).toISOString() }; }
function toLocalInput(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function startOfDay(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function dateKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
function eventsForDay(events: CalendarEvent[], day: Date) { return events.filter((event) => { const start = startOfDay(new Date(event.start_at)); const end = startOfDay(new Date(event.end_at)); if (event.source_type === "work_plan") end.setDate(end.getDate() - 1); return day >= start && day <= end; }); }
function formatTime(value: string) { return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function formatDateRange(start: string, end: string) { return `${new Date(start).toLocaleString()} - ${new Date(end).toLocaleString()}`; }
function colorClass(event: CalendarEvent) { const color = event.source_type === "work_plan" ? projectColor(event.project_id) : event.color; return COLORS.find((item) => item.value === color)?.className ?? "bg-blue-500"; }
function projectColor(projectId: string | null): CalendarEventColor { if (!projectId) return "blue"; let hash = 0; for (const character of projectId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0; return COLORS[hash % COLORS.length].value; }
function overlapLayout(events: CalendarEvent[]) {
  const layout = new Map<string, { column: number; columns: number }>();
  const groups: CalendarEvent[][] = [];
  const sorted = [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  for (const event of sorted) {
    const start = new Date(event.start_at).getTime();
    const end = new Date(event.end_at).getTime();
    const group = groups.find((items) => items.some((item) => start < new Date(item.end_at).getTime() && new Date(item.start_at).getTime() < end));
    if (group) group.push(event); else groups.push([event]);
  }
  for (const group of groups) {
    const columns: CalendarEvent[][] = [];
    for (const event of group) {
      const start = new Date(event.start_at).getTime();
      const end = new Date(event.end_at).getTime();
      let column = columns.findIndex((items) => !items.some((item) => start < new Date(item.end_at).getTime() && new Date(item.start_at).getTime() < end));
      if (column === -1) { column = columns.length; columns.push([]); }
      columns[column].push(event);
      layout.set(event.id, { column: column + 1, columns: columns.length });
    }
    for (const event of group) {
      const placement = layout.get(event.id);
      if (placement) placement.columns = columns.length;
    }
  }
  return layout;
}
function movePeriod(date: Date, view: CalendarView, amount: number) { const next = new Date(date); if (view === "month") next.setMonth(next.getMonth() + amount); else if (view === "week") next.setDate(next.getDate() + amount * 7); else next.setDate(next.getDate() + amount); return next; }
function weekLabel(date: Date) { const start = new Date(date); start.setDate(date.getDate() - date.getDay()); const end = new Date(start); end.setDate(start.getDate() + 6); return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} - ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`; }
