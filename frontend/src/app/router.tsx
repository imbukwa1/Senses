import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";

import { LoadingState } from "@/components/common/loading-state";
import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { ProjectsHeaderActions } from "@/features/projects/project-header-actions";

const LoginPage = lazy(() => import("@/pages/login-page").then((module) => ({ default: module.LoginPage })));
const ProjectDetailPlaceholderPage = lazy(() =>
  import("@/pages/project-detail-placeholder-page").then((module) => ({ default: module.ProjectDetailPlaceholderPage })),
);
const HomePage = lazy(() => import("@/pages/placeholders/home-page").then((module) => ({ default: module.HomePage })));
const NotFoundPage = lazy(() => import("@/pages/placeholders/not-found-page").then((module) => ({ default: module.NotFoundPage })));
const ProjectsPage = lazy(() => import("@/pages/placeholders/projects-page").then((module) => ({ default: module.ProjectsPage })));
const SearchPage = lazy(() => import("@/pages/placeholders/search-page").then((module) => ({ default: module.SearchPage })));

function RouteLoader({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState label="Loading page" />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <RouteLoader>
        <LoginPage />
      </RouteLoader>
    ),
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
        element: (
          <RouteLoader>
            <HomePage />
          </RouteLoader>
        ),
        handle: {
          title: "Home",
          subtitle: "Shared application layout foundation.",
          breadcrumbs: [{ label: "Home" }],
        },
      },
      {
        path: "projects",
        element: (
          <RouteLoader>
            <ProjectsPage />
          </RouteLoader>
        ),
        handle: {
          title: "Projects",
          subtitle: "Accessible project portfolio.",
          breadcrumbs: [{ label: "Projects" }],
          actions: <ProjectsHeaderActions />,
        },
      },
      {
        path: "projects/:projectId",
        element: (
          <RouteLoader>
            <ProjectDetailPlaceholderPage />
          </RouteLoader>
        ),
        handle: {
          title: "Project",
          subtitle: "Prepared route for the future project dashboard.",
          breadcrumbs: [{ label: "Projects", href: "/projects" }, { label: "Project" }],
        },
      },
      {
        path: "search",
        element: (
          <RouteLoader>
            <SearchPage />
          </RouteLoader>
        ),
        handle: {
          title: "Search",
          subtitle: "Find accessible projects, phases, and tasks.",
          breadcrumbs: [{ label: "Search" }],
        },
      },
      {
        path: "*",
        element: (
          <RouteLoader>
            <NotFoundPage />
          </RouteLoader>
        ),
        handle: {
          title: "Not found",
          breadcrumbs: [{ label: "Not found" }],
        },
      },
    ],
  },
]);
