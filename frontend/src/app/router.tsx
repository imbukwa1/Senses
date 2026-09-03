import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { LoginPage } from "@/pages/login-page";
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
          subtitle: "Placeholder for the future project portfolio screen.",
          breadcrumbs: [{ label: "Projects" }],
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
