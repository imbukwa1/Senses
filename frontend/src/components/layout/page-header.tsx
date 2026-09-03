import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
};

export function PageHeader({ title, subtitle, breadcrumbs = [], actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b bg-background px-4 py-5 sm:px-6 lg:px-8">
      {breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((item, index) => (
              <li key={`${item.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight className="size-4" aria-hidden="true" /> : null}
                {item.href ? (
                  <Link
                    to={item.href}
                    className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span>{item.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl font-semibold tracking-normal text-foreground">{title}</h1>
          {subtitle ? <p className="max-w-3xl text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
