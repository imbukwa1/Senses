import { NavLink } from "react-router-dom";

import logoUrl from "@/assets/logo.svg";
import { navigationItems } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r bg-surface lg:sticky lg:top-0 lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <SensesMark />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">Senses Hub</p>
          <p className="truncate text-xs text-muted-foreground">Project Management</p>
        </div>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 space-y-1 px-3 py-4">
        {navigationItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                isActive && "bg-primary/10 text-primary",
              )
            }
          >
            <item.icon className="size-4" aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export function SensesMark() {
  return (
    <img src={logoUrl} alt="" className="size-9 shrink-0 rounded-md bg-white object-contain" aria-hidden="true" />
  );
}
