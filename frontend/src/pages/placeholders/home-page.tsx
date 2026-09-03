import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { env } from "@/lib/env";

export function HomePage() {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5 rounded-md border bg-surface p-6 shadow-soft">
        <div className="flex size-11 items-center justify-center rounded-md border bg-background">
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">Application shell ready</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            This temporary route verifies the shared layout, navigation, providers, and design tokens.
          </p>
        </div>
        <div className="grid max-w-xl gap-3 sm:grid-cols-[1fr_auto]">
          <Input value={env.apiBaseUrl} readOnly aria-label="Configured API base URL" />
          <Button type="button">Ready</Button>
        </div>
      </div>
      <aside className="rounded-md border bg-surface p-5 shadow-soft" aria-label="Foundation status">
        <h2 className="text-sm font-semibold text-foreground">Foundation</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Routing</dt>
            <dd className="font-medium text-success">Ready</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Layout</dt>
            <dd className="font-medium text-success">Ready</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Tokens</dt>
            <dd className="font-medium text-success">Ready</dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}
