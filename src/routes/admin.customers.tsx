import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminCustomers } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { VehicleImage } from "@/components/VehicleImage";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/admin/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { pathname } = useLocation();
  const fn = useServerFn(listAdminCustomers);
  const { data } = useQuery({ queryKey: ["admin-customers"], queryFn: () => fn() });
  const [q, setQ] = useState("");

  if (pathname !== "/admin/customers") return <Outlet />;

  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return (data ?? []).filter((c: any) => {
      if (!lower) return true;
      return (
        c.full_name?.toLowerCase().includes(lower) ||
        c.phone?.toLowerCase().includes(lower) ||
        c.area?.toLowerCase().includes(lower)
      );
    });
  }, [data, q]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data?.length ?? 0} customers · click any card for the full profile</p>
        </div>
        <Input className="w-full max-w-xs" placeholder="Search name, phone, area…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c: any) => {
          const expired = c.subscription_end < today;
          const dueSoon = !expired && c.subscription_end <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
          const tone = expired ? "destructive" : dueSoon ? "secondary" : c.is_active ? "default" : "outline";
          const tag = expired ? "Expired" : dueSoon ? "Due soon" : c.is_active ? "Active" : "Paused";
          return (
            <Link key={c.id} to="/admin/customers/$id" params={{ id: c.id }} className="block">
              <Card className="p-5 transition hover:border-foreground/40 hover:shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground">+91 {c.phone}</p>
                  </div>
                  <Badge variant={tone as any}>{tag}</Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{c.area}{c.pincode ? ` · ${c.pincode}` : ""}</p>
                {c.vehicles?.[0] && (
                  <p className="mt-3 rounded-md bg-muted px-2 py-1.5 text-xs">
                    {c.vehicles[0].make} {c.vehicles[0].model}{c.vehicles[0].registration_number ? ` · ${c.vehicles[0].registration_number}` : ""}
                    {c.vehicles.length > 1 && <span className="ml-1 text-muted-foreground">+{c.vehicles.length - 1}</span>}
                  </p>
                )}
                <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">Renews {c.subscription_end}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
