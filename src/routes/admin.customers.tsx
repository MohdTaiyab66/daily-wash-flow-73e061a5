import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAdminCustomers } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VehicleImage } from "@/components/VehicleImage";
import { Car, Search } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/admin/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { pathname } = useLocation();
  const fn = useServerFn(listAdminCustomers);
  const { data, isLoading } = useQuery({ queryKey: ["admin-customers"], queryFn: () => fn() });
  const [q, setQ] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return (data ?? []).filter((c: any) => {
      if (!lower) return true;
      return (
        c.full_name?.toLowerCase().includes(lower) ||
        c.phone?.toLowerCase().includes(lower) ||
        c.area?.toLowerCase().includes(lower) ||
        (c.vehicles ?? []).some((v: any) => String(v.registration_number ?? "").toLowerCase().includes(lower))
      );
    });
  }, [data, q]);

  if (pathname !== "/admin/customers") return <Outlet />;

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} of {data?.length ?? 0} customers</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Name, phone, area, registration…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {isLoading && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((c: any) => {
          const expired = c.subscription_end < today;
          const status = expired ? "Expired" : c.is_active ? "Active" : "Paused";
          const statusTone = expired
            ? "bg-destructive/10 text-destructive"
            : c.is_active
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-muted text-muted-foreground";
          const paid = c.payment_status === "paid";
          const primary = c.vehicles?.[0];
          return (
            <Card key={c.id} className="rounded-2xl p-5 shadow-none transition-colors hover:border-primary/30">
              <div className="flex items-start gap-3">
                {primary ? (
                  <VehicleImage
                    path={primary.front_image_path}
                    signedUrl={primary.signed_image_url}
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                    alt={c.full_name}
                  />
                ) : (
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {String(c.full_name ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    +91 {String(c.phone ?? "").replace(/^\+?91/, "")} · {c.area}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${statusTone}`}>{status}</span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Field label="Vehicles" value={<span className="inline-flex items-center gap-1"><Car className="h-3 w-3" />{c.vehicles?.length ?? 0}</span>} />
                <Field label="Plan" value={c.subscription_plan ?? "—"} />
                <Field label="Renewal" value={c.subscription_end ?? "—"} />
                <Field
                  label="Payment"
                  value={<span className={paid ? "text-emerald-600" : "text-destructive"}>{paid ? "Paid" : "Pending"}</span>}
                />
              </dl>

              <Button asChild variant="outline" className="mt-4 w-full rounded-full">
                <Link to="/admin/customers/$id" params={{ id: c.id }}>Open Profile</Link>
              </Button>
            </Card>
          );
        })}
        {!isLoading && rows.length === 0 && (
          <p className="col-span-full py-12 text-center text-sm text-muted-foreground">No customers match.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
