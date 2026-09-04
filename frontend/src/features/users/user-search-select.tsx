import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { InlineErrorMessage } from "@/components/common/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useUsersSearchQuery } from "./hooks";
import type { UserLookupResult } from "./types";

export type UserSearchSelectProps = {
  label: string;
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  knownUsers?: UserLookupResult[];
};

export function UserSearchSelect({
  disabled,
  knownUsers = [],
  label,
  onValueChange,
  placeholder = "Select user",
  value,
}: UserSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const usersQuery = useUsersSearchQuery(search, open);
  const options = useMemo(() => mergeUsers(knownUsers, usersQuery.data ?? []), [knownUsers, usersQuery.data]);
  const selectedUser = options.find((user) => user.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between" disabled={disabled} aria-label={label} aria-expanded={open}>
          <span className={cn("truncate text-left", !selectedUser && "text-muted-foreground")}>
            {selectedUser ? formatUserLabel(selectedUser) : placeholder}
          </span>
          <ChevronDown className="size-4 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            aria-label={`Search ${label}`}
            className="pl-9"
          />
        </div>
        {usersQuery.error ? <InlineErrorMessage message="Users could not be loaded." /> : null}
        <div className="mt-2 max-h-60 overflow-y-auto" role="listbox" aria-label={label}>
          {usersQuery.isLoading ? <p className="px-2 py-3 text-sm text-muted-foreground">Searching users...</p> : null}
          {!usersQuery.isLoading && options.length > 0
            ? options.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    onValueChange(user.id);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={user.id === value}
                >
                  <Check className={cn("size-4", user.id === value ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{user.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                  </span>
                </button>
              ))
            : null}
          {!usersQuery.isLoading && usersQuery.normalizedSearch && options.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No users found.</p>
          ) : null}
          {!usersQuery.isLoading && !usersQuery.normalizedSearch && options.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Search by name or email.</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function mergeUsers(knownUsers: UserLookupResult[], searchedUsers: UserLookupResult[]) {
  const usersById = new Map<string, UserLookupResult>();
  for (const user of knownUsers) {
    usersById.set(user.id, user);
  }
  for (const user of searchedUsers) {
    usersById.set(user.id, user);
  }
  return [...usersById.values()];
}

function formatUserLabel(user: UserLookupResult) {
  return `${user.name} (${user.email})`;
}
