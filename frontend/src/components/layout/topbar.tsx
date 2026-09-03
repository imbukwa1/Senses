import { LogOut, Search } from "lucide-react";

import { MobileNav } from "@/components/layout/mobile-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/hooks";

export function Topbar() {
  const { logout, user } = useAuth();
  const initials = getInitials(user?.name ?? user?.email ?? "User");

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
          <p className="text-sm font-medium leading-5 text-foreground">{user?.name ?? "User"}</p>
          <p className="text-xs leading-4 text-muted-foreground">{user?.email ?? "Authenticated"}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="rounded-full border bg-background" aria-label="Open user menu">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-foreground">{user?.name ?? "User"}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email ?? "Authenticated"}</p>
            </div>
            <DropdownMenuSeparator className="my-1 h-px bg-border" />
            <DropdownMenuItem onSelect={logout}>
              <LogOut className="mr-2 size-4" aria-hidden="true" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return value.slice(0, 2).toUpperCase();
}
