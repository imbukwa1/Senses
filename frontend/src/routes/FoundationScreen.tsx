import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { env } from "@/lib/env";

export function FoundationScreen() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12">
        <div className="max-w-2xl space-y-4">
          <div className="flex size-11 items-center justify-center rounded-md border bg-surface shadow-soft">
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">SENSES frontend foundation</p>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">
              React, routing, query providers, and design tokens are ready.
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              API target: <span className="font-medium text-foreground">{env.apiBaseUrl}</span>
            </p>
          </div>
        </div>
        <div className="grid max-w-xl gap-3 sm:grid-cols-[1fr_auto]">
          <Input value="Foundation check" readOnly aria-label="Foundation check" />
          <Button type="button">Ready</Button>
        </div>
      </section>
    </main>
  );
}
