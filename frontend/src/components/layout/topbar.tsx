import { Search } from "lucide-react";

import { MobileNav } from "@/components/layout/mobile-nav";

export function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-surface/95 px-4 shadow-soft backdrop-blur sm:px-6 lg:px-8">
      <MobileNav />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative hidden w-full max-w-md sm:block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            readOnly
            aria-label="Search placeholder"
            placeholder="Search"
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-5 text-foreground">User</p>
          <p className="text-xs leading-4 text-muted-foreground">Profile</p>
        </div>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full border bg-background text-sm font-semibold text-primary outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open user menu"
        >
          U
        </button>
      </div>
    </header>
  );
}
