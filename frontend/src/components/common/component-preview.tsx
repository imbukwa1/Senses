import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, MoreHorizontal } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { DateInput } from "@/components/common/date-input";
import { FormField } from "@/components/common/form-field";
import { HealthBadge } from "@/components/common/health-badge";
import { SearchableSelect } from "@/components/common/searchable-select";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const demoSchema = z.object({
  title: z.string().min(1),
  option: z.string().min(1),
  accepted: z.boolean(),
  date: z.string().min(1),
});

type DemoValues = z.infer<typeof demoSchema>;

export function ComponentPreview() {
  const form = useForm<DemoValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: {
      title: "Reusable component check",
      option: "alpha",
      accepted: true,
      date: "2026-09-03",
    },
  });

  return (
    <ToastProvider swipeDirection="right">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Reusable component preview</CardTitle>
            <CardDescription>Non-business controls for validating the shared UI foundation.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField label="Text input" required>
              {({ id, describedBy, invalid }) => (
                <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register("title")} />
              )}
            </FormField>
            <FormField label="Native date input">
              {({ id, describedBy, invalid }) => (
                <DateInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...form.register("date")} />
              )}
            </FormField>
            <FormField label="Select">
              {({ id, describedBy, invalid }) => (
                <Controller
                  control={form.control}
                  name="option"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid}>
                        <SelectValue placeholder="Choose one" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alpha">Alpha</SelectItem>
                        <SelectItem value="beta">Beta</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField label="Searchable select">
              {() => (
                <Controller
                  control={form.control}
                  name="option"
                  render={({ field }) => (
                    <SearchableSelect
                      label="Searchable option"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={[
                        { label: "Alpha", value: "alpha" },
                        { label: "Beta", value: "beta" },
                      ]}
                    />
                  )}
                />
              )}
            </FormField>
            <FormField label="Textarea" className="md:col-span-2">
              {({ id, describedBy, invalid }) => (
                <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} defaultValue="A generic notes field." />
              )}
            </FormField>
            <div className="flex items-center gap-2">
              <Controller
                control={form.control}
                name="accepted"
                render={({ field }) => (
                  <Checkbox id="component-preview-checkbox" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <Label htmlFor="component-preview-checkbox">Checkbox</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>States and overlays</CardTitle>
            <CardDescription>Generic shell-ready patterns.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge value="Planning" />
              <StatusBadge value="In Progress" />
              <StatusBadge value="High" />
              <HealthBadge value="Active" />
            </div>
            <Progress value={64} aria-label="Preview progress" />
            <Separator />
            <div className="grid gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline">Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generic dialog</DialogTitle>
                    <DialogDescription>Reusable modal structure with Radix accessibility.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button type="button">Done</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Sheet>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline">Sheet</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Generic drawer</SheetTitle>
                    <SheetDescription>Reusable drawer structure for future screens.</SheetDescription>
                  </SheetHeader>
                </SheetContent>
              </Sheet>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="icon" aria-label="Open menu">
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Generic action</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="outline" size="icon" aria-label="Notification info">
                      <Bell className="size-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Generic tooltip</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>
      </div>
      <Toast open={false}>
        <ToastTitle>Notification</ToastTitle>
        <ToastDescription>Generic toast foundation.</ToastDescription>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}
