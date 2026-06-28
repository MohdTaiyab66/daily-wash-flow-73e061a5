import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverview, getAvailableCustomersByArea } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import {
  Users, UserSquare2, ClipboardList, IndianRupee, CalendarDays, CheckCircle2, MapPin, UserCheck,
  UserPlus, Sparkles, Map as MapIcon, Camera, RotateCcw, Route as RouteIcon,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: Overview,
});

const QUICK_NAV: Array<{ to: any; label: string; icon: any; desc: string }> = [
  { to: "/admin/customers", label: "Customers", icon: UserSquare2, desc: "Browse & manage" },
  { to: "/admin/partners", label: "Partners", icon: Users, desc: "Active partners" },
  { to: "/admin/import", label: "Import Customer", icon: UserPlus, desc: "Add new customer" },
  { to: "/admin/marketplace", label: "Marketplace", icon: Sparkles, desc: "Daily Shine offers" },
  { to: "/admin/customer-map", label: "Customer Map", icon: MapIcon, desc: "Geographic view" },
  { to: "/admin/route-manager", label: "Route Manager", icon: RouteIcon, desc: "Daily routes" },
  { to: "/admin/services", label: "Services", icon: ClipboardList, desc: "All services" },
  { to: "/admin/photos", label: "Photos", icon: Camera, desc: "Service photos" },
  { to: "/admin/revenue", label: "Revenue", icon: IndianRupee, desc: "Financial summary" },
  { to: "/admin/renewals", label: "Renewals", icon: RotateCcw, desc: "Upcoming renewals" },
];

function Overview() {
  const fn = useServerFn(getAdminOverview);
  const byArea = useServerFn(getAvailableCustomersByArea);
  const { data } = useQuery({ queryKey: ["admin-overview"], queryFn: () => fn() });
  const { data: areas } = useQuery({ queryKey: ["admin-available-by-area"], queryFn: () => byArea() });

  const stats: Array<{ label: string; value: number | string; icon: any; to: any }> = [
    { label: "Active Partners", value: data?.partners ?? 0, icon: Users, to: "/admin/partners" },
    { label: "Customers", value: data?.customers ?? 0, icon: UserSquare2, to: "/admin/customers" },
    { label: "Total Services", value: data?.services ?? 0, icon: ClipboardList, to: "/admin/services" },
    { label: "Completed", value: data?.completed ?? 0, icon: CheckCircle2, to: "/admin/services" },
    { label: "Today's Services", value: data?.todayServices ?? 0, icon: CalendarDays, to: "/admin/live" },
    { label: "Revenue (₹)", value: data?.revenue ?? 0, icon: IndianRupee, to: "/admin/revenue" },
  ];

  const totalAvailable = (areas ?? []).reduce((s: number, a: any) => s + (a.available ?? 0), 0);

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Urban Wash · Lucknow</p>
        </div>
        <Link to="/admin/manual-assignment" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <UserCheck className="h-4 w-4" /> Manual assignment
        </Link>
      </div>

      {/* Stat tiles */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} to={s.to} className="block">
              <Card className="p-5 transition-colors hover:bg-accent">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{typeof s.value === "number" ? s.value.toLocaleString() : s.value}</p>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Quick navigation */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Quick navigation</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {QUICK_NAV.map((q) => {
            const Icon = q.icon;
            return (
              <Link key={q.label} to={q.to} className="block">
                <Card className="p-4 transition-colors hover:bg-accent">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{q.label}</p>
                      <p className="truncate text-xs text-muted-foreground">{q.desc}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      <Card className="mt-8 p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <MapPin className="h-4 w-4 text-muted-foreground" /> Available customers by area
          </h2>
          <span className="text-sm text-muted-foreground">{totalAvailable} unassigned · across {areas?.length ?? 0} areas</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2">Area</th>
                <th className="py-2 text-right">Available</th>
                <th className="py-2 text-right">Active total</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(areas ?? []).map((a: any) => (
                <tr key={a.area} className="border-t border-border">
                  <td className="py-2 font-medium">{a.area}</td>
                  <td className="py-2 text-right">
                    <span className={a.available === 0 ? "text-muted-foreground" : "font-semibold text-foreground"}>{a.available}</span>
                  </td>
                  <td className="py-2 text-right text-muted-foreground">{a.total_active}</td>
                  <td className="py-2 text-right">
                    <Link to="/admin/manual-assignment" className="text-xs text-primary hover:underline">Assign →</Link>
                  </td>
                </tr>
              ))}
              {(areas ?? []).length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No areas yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
