import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCustomersForMap } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/customer-map")({
  component: CustomerMapPage,
});

function CustomerMapPage() {
  const fn = useServerFn(listCustomersForMap);
  const { data } = useQuery({ queryKey: ["admin-customer-map"], queryFn: () => fn() });
  const rows = data ?? [];
  const groups: Record<string, any[]> = {};
  rows.forEach((r: any) => { (groups[r.area] ??= []).push(r); });

  const counts = {
    active: rows.filter((r: any) => r.bucket === "active").length,
    renewal_due: rows.filter((r: any) => r.bucket === "renewal_due").length,
    inactive: rows.filter((r: any) => r.bucket === "inactive").length,
  };

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Customer Map</h1>
      <p className="mt-1 text-sm text-muted-foreground">Grouped by area · color-coded by subscription state.</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Legend tone="bg-emerald-600" label={`Active · ${counts.active}`} />
        <Legend tone="bg-amber-500" label={`Renewal due · ${counts.renewal_due}`} />
        <Legend tone="bg-destructive" label={`Inactive · ${counts.inactive}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {Object.entries(groups).sort().map(([area, list]) => (
          <Card key={area} className="p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{area}</h2>
              <span className="text-2xl font-semibold">{list.length}</span>
            </div>
            <div className="mt-3 grid gap-2">
              {list.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${dotFor(c.bucket)}`} />
                    <span className="truncate">{c.full_name}</span>
                  </div>
                  <Badge variant="outline" className="capitalize text-[10px]">{c.bucket.replace("_", " ")}</Badge>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function dotFor(b: string) {
  if (b === "active") return "bg-emerald-600";
  if (b === "renewal_due") return "bg-amber-500";
  return "bg-destructive";
}
function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
      <span className={`h-2 w-2 rounded-full ${tone}`} />{label}
    </div>
  );
}
