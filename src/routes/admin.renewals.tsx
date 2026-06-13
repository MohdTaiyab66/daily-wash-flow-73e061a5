import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRenewals } from "@/lib/ops.functions";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/renewals")({
  component: RenewalsPage,
});

function RenewalsPage() {
  const fn = useServerFn(getRenewals);
  const { data } = useQuery({ queryKey: ["admin-renewals"], queryFn: () => fn() });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Renewals</h1>
      <p className="mt-1 text-sm text-muted-foreground">Subscriptions ending soon — keep these customers active.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Bucket title="Renewals today" rows={data?.today ?? []} />
        <Bucket title="This week" rows={data?.week ?? []} />
        <Bucket title="This month" rows={data?.month ?? []} />
      </div>
    </div>
  );
}

function Bucket({ title, rows }: { title: string; rows: any[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        <span className="text-2xl font-semibold">{rows.length}</span>
      </div>
      <div className="mt-3 divide-y divide-border">
        {rows.length === 0 && <p className="py-4 text-xs text-muted-foreground">Nothing here.</p>}
        {rows.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{c.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{c.area} · +91 {c.phone}</p>
            </div>
            <p className="text-xs text-muted-foreground">{c.subscription_end}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
