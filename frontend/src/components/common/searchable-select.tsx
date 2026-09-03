import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  label: string;
  value: string;
};

export type SearchableSelectProps = {
  label: string;
  options: SearchableSelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function SearchableSelect({
  label,
  options,
  value,
  onValueChange,
  placeholder = "Select option",
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          disabled={disabled}
          aria-label={label}
          aria-expanded={open}
        >
          <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronDown className="size-4 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search options"
            aria-label={`Search ${label}`}
            className="pl-9"
          />
        </div>
        <div className="mt-2 max-h-60 overflow-y-auto" role="listbox" aria-label={label}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={option.value === value}
              >
                <Check className={cn("size-4", option.value === value ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                <span className="truncate">{option.label}</span>
              </button>
            ))
          ) : (
            <p className="px-2 py-3 text-sm text-muted-foreground">No options found.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
