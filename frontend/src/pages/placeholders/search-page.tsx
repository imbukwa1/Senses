import { ArrowUpRight, Search } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { StatusBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/features/auth/api";
import { normalizeSearchQuery, useSearchQuery } from "@/features/search/hooks";
import type { SearchResult, SearchResultType } from "@/features/search/types";

const resultTypeLabels: Record<SearchResultType, string> = {
  project: "Project",
  phase: "Phase",
  task: "Task",
};

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryParam = searchParams.get("q") ?? "";
  const [draftQuery, setDraftQuery] = useState(queryParam);
  const searchQuery = useSearchQuery(queryParam);
  const results = searchQuery.data ?? [];
  const groupedResults = useMemo(() => groupResults(results), [results]);

  useEffect(() => {
    setDraftQuery(queryParam);
  }, [queryParam]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = normalizeSearchQuery(draftQuery);

    if (!normalizedQuery) {
      navigate("/search");
      return;
    }

    navigate(`/search?q=${encodeURIComponent(normalizedQuery)}`);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border bg-surface p-4 shadow-soft">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              aria-label="Search projects, phases, and tasks"
              placeholder="Search projects, phases, and tasks"
              className="pl-9"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </section>

      {!searchQuery.normalizedQuery ? (
        <EmptyState title="Search projects, phases, and tasks." description="Enter a project, phase, or task term to search accessible records." />
      ) : null}

      {searchQuery.isLoading ? <SearchSkeleton /> : null}

      {searchQuery.isError ? <ErrorState title={errorTitle(searchQuery.error)} message={errorMessage(searchQuery.error)} /> : null}

      {!searchQuery.isLoading && !searchQuery.isError && searchQuery.normalizedQuery && results.length === 0 ? (
        <EmptyState title="No results found." description="Try a different search term." />
      ) : null}

      {!searchQuery.isLoading && !searchQuery.isError && results.length > 0 ? (
        <section className="space-y-4" aria-label={`Search results for ${searchQuery.normalizedQuery}`}>
          <div>
            <h2 className="text-base font-semibold text-foreground">Search results for &quot;{searchQuery.normalizedQuery}&quot;</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? "result" : "results"} from accessible projects, phases, and tasks.
            </p>
          </div>
          <ResultGroup title="Projects" results={groupedResults.project} />
          <ResultGroup title="Phases" results={groupedResults.phase} />
          <ResultGroup title="Tasks" results={groupedResults.task} />
        </section>
      ) : null}
    </div>
  );
}

function ResultGroup({ results, title }: { title: string; results: SearchResult[] }) {
  if (results.length === 0) {
    return null;
  }

  return (
    <section className="rounded-md border bg-surface shadow-soft" aria-labelledby={`${title.toLowerCase()}-results-heading`}>
      <div className="border-b px-4 py-3">
        <h3 id={`${title.toLowerCase()}-results-heading`} className="text-sm font-semibold text-foreground">
          {title}
        </h3>
      </div>
      <ul className="divide-y">
        {results.map((result) => (
          <li key={resultKey(result)}>
            <SearchResultRow result={result} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SearchResultRow({ result }: { result: SearchResult }) {
  return (
    <Link
      to={resultLink(result)}
      className="flex items-start justify-between gap-4 px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={`Open ${resultTitle(result)}`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{resultTitle(result)}</span>
          <Badge variant={resultTypeVariant(result.result_type)}>{resultTypeLabels[result.result_type]}</Badge>
          {isKnownStatus(result.status) ? <StatusBadge value={result.status} /> : <Badge variant="outline">{result.status}</Badge>}
        </div>
        <SearchContext result={result} />
      </div>
      <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

function SearchContext({ result }: { result: SearchResult }) {
  if (result.result_type === "project") {
    return <p className="text-sm text-muted-foreground">{result.project_code}</p>;
  }

  if (result.result_type === "phase") {
    return (
      <p className="text-sm text-muted-foreground">
        Project: {result.project_name} <span className="font-mono text-xs">({result.project_code})</span>
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Project: {result.project_name} <span className="font-mono text-xs">({result.project_code})</span>
      {result.phase_name ? <> · Phase: {result.phase_name}</> : null}
    </p>
  );
}

function SearchSkeleton() {
  return (
    <section className="rounded-md border bg-surface p-4 shadow-soft" aria-label="Loading search results">
      <div className="space-y-3">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </section>
  );
}

function groupResults(results: SearchResult[]) {
  return {
    project: results.filter((result) => result.result_type === "project"),
    phase: results.filter((result) => result.result_type === "phase"),
    task: results.filter((result) => result.result_type === "task"),
  };
}

function resultTitle(result: SearchResult) {
  if (result.result_type === "project") {
    return result.project_name;
  }

  if (result.result_type === "phase") {
    return result.phase_name ?? "Untitled phase";
  }

  return result.task_name ?? "Untitled task";
}

function resultLink(result: SearchResult) {
  return `/projects/${result.project_id}`;
}

function resultKey(result: SearchResult) {
  return `${result.result_type}-${result.task_id ?? result.phase_id ?? result.project_id}`;
}

function resultTypeVariant(resultType: SearchResultType) {
  if (resultType === "project") {
    return "default";
  }

  if (resultType === "phase") {
    return "purple";
  }

  return "info";
}

function isKnownStatus(value: string): value is "Planning" | "Not Started" | "Active" | "On Hold" | "Completed" | "In Progress" | "Blocked" {
  return ["Planning", "Not Started", "Active", "On Hold", "Completed", "In Progress", "Blocked"].includes(value);
}

function errorTitle(error: Error | null) {
  if (error instanceof ApiError && error.status === 403) {
    return "Access denied";
  }

  return "Search could not be completed";
}

function errorMessage(error: Error | null) {
  if (error instanceof ApiError && error.status === 403) {
    return "You do not have access to these search results.";
  }

  return error?.message ?? "The server is unavailable. Please try again shortly.";
}
