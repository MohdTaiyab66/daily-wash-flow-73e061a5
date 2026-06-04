import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminCustomers } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const fn = useServerFn(listAdminCustomers);
  const { data } = useQuery({ queryKey: ["admin-customers"], queryFn: () => fn() });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Customers</h1>
      <p className="mt-1 text-sm text-muted-foreground">{data?.length ?? 0} active subscriptions</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((c: any) => (
          <Card key={c.id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{c.full_name}</p>
                <p className="text-xs text-muted-foreground">+91 {c.phone}</p>
              </div>
              <Badge variant={c.is_active ? "default" : "outline"}>{c.is_active ? "Active" : "Paused"}</Badge>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{c.address_line}</p>
            <p className="text-xs text-muted-foreground">{c.area} · {c.pincode}</p>
            {c.vehicles?.[0] && (
              <p className="mt-3 rounded-md bg-muted px-2 py-1.5 text-xs">
                {c.vehicles[0].make} {c.vehicles[0].model} · {c.vehicles[0].registration_number}
              </p>
            )}
            <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">Plan ends {c.subscription_end}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
