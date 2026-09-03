import { createBrowserRouter } from "react-router-dom";
import { Plus } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { LoginPage } from "@/pages/login-page";
import { ProjectDetailPlaceholderPage } from "@/pages/project-detail-placeholder-page";
import { HomePage } from "@/pages/placeholders/home-page";
import { NotFoundPage } from "@/pages/placeholders/not-found-page";
import { ProjectsPage } from "@/pages/placeholders/projects-page";
import { SearchPage } from "@/pages/placeholders/search-page";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <HomePage />,
        handle: {
          title: "Home",
          subtitle: "Shared application layout foundation.",
          breadcrumbs: [{ label: "Home" }],
        },
      },
      {
        path: "projects",
        element: <ProjectsPage />,
        handle: {
          title: "Projects",
          subtitle: "Accessible project portfolio.",
          breadcrumbs: [{ label: "Projects" }],
          actions: (
            <Button type="button" disabled title="Project creation is planned for a later frontend section.">
              <Plus className="size-4" aria-hidden="true" />
              Add Project
            </Button>
          ),
        },
      },
      {
        path: "projects/:projectId",
        element: <ProjectDetailPlaceholderPage />,
        handle: {
          title: "Project",
          subtitle: "Prepared route for the future project dashboard.",
          breadcrumbs: [{ label: "Projects", href: "/projects" }, { label: "Project" }],
        },
      },
      {
        path: "search",
        element: <SearchPage />,
        handle: {
          title: "Search",
          subtitle: "Placeholder for future backend-backed search.",
          breadcrumbs: [{ label: "Search" }],
        },
      },
      {
        path: "*",
        element: <NotFoundPage />,
        handle: {
          title: "Not found",
          breadcrumbs: [{ label: "Not found" }],
        },
      },
    ],
  },
]);
