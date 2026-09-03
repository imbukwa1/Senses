export function ProjectsPage() {
  return (
    <section className="rounded-md border bg-surface shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 className="text-base font-semibold text-foreground">Projects area placeholder</h2>
      </div>
      <div className="grid gap-3 p-5">
        {["Project portfolio table area", "Project action area", "Project summary area"].map((label) => (
          <div key={label} className="rounded-md border bg-background px-4 py-3 text-sm text-muted-foreground">
            {label}
          </div>
        ))}
      </div>
    </section>
  );
}
