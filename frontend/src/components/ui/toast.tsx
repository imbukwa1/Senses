import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitive.Provider;
const Toast = ToastPrimitive.Root;
const ToastAction = ToastPrimitive.Action;
const ToastTitle = ToastPrimitive.Title;
const ToastDescription = ToastPrimitive.Description;

function ToastViewport({ className, ...props }: React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn("fixed bottom-0 right-0 z-100 flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:max-w-sm", className)}
      {...props}
    />
  );
}

function ToastClose({ className, ...props }: React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      className={cn("absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      {...props}
    >
      <X className="size-4" aria-hidden="true" />
      <span className="sr-only">Close</span>
    </ToastPrimitive.Close>
  );
}

export { Toast, ToastAction, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport };
