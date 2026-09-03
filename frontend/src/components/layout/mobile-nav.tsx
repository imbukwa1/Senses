import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { NavLink } from "react-router-dom";

import { navigationItems } from "@/components/layout/nav-items";
import { SensesMark } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

export function MobileNav() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="inline-flex size-10 items-center justify-center rounded-md border bg-surface text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
        <Menu className="size-5" aria-hidden="true" />
        <span className="sr-only">Open navigation</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/25" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col border-r bg-surface shadow-lg focus-visible:outline-none">
          <div className="flex h-16 items-center justify-between border-b px-5">
            <Dialog.Title className="flex items-center gap-3 text-sm font-semibold text-foreground">
              <SensesMark />
              Senses Hub
            </Dialog.Title>
            <Dialog.Close className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-5" aria-hidden="true" />
              <span className="sr-only">Close navigation</span>
            </Dialog.Close>
          </div>
          <nav aria-label="Mobile primary navigation" className="space-y-1 px-3 py-4">
            {navigationItems.map((item) => (
              <Dialog.Close asChild key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                      isActive && "bg-primary/10 text-primary",
                    )
                  }
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              </Dialog.Close>
            ))}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
