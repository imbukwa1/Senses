import type * as React from "react";
import { Outlet, useMatches } from "react-router-dom";

import { PageHeader, type BreadcrumbItem } from "@/components/layout/page-header";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export type RouteHandle = {
  title?: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
};

export function AppShell() {
  const matches = useMatches();
  const currentHandle = [...matches].reverse().find((match) => {
    const handle = match.handle as RouteHandle | undefined;
    return Boolean(handle?.title);
  })?.handle as RouteHandle | undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <PageHeader
            title={currentHandle?.title ?? "SENSES"}
            subtitle={currentHandle?.subtitle}
            breadcrumbs={currentHandle?.breadcrumbs}
            actions={currentHandle?.actions}
          />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
