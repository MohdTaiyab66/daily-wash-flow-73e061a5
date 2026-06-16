import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Users, UserSquare2, ClipboardList, Wallet, ArrowLeft, Settings, Camera, UserPlus, Activity, ShieldAlert, TrendingUp, CalendarCheck, RotateCcw, Map, UserCheck } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Urban Wash · Admin" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { pathname } = useLocation();
  const nav: Array<{ to: "/admin" | "/admin/live" | "/admin/fraud" | "/admin/reliability" | "/admin/attendance" | "/admin/renewals" | "/admin/customer-map" | "/admin/wallet" | "/admin/partners" | "/admin/customers" | "/admin/import" | "/admin/manual-assignment" | "/admin/services" | "/admin/payouts" | "/admin/photos" | "/admin/settings"; label: string; icon: typeof Users; exact?: boolean }> = [
    { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
    { to: "/admin/live", label: "Live Ops", icon: Activity },
    { to: "/admin/manual-assignment", label: "Manual Assign", icon: UserCheck },
    { to: "/admin/fraud", label: "Fraud Review", icon: ShieldAlert },
    { to: "/admin/reliability", label: "Reliability", icon: TrendingUp },
    { to: "/admin/attendance", label: "Attendance", icon: CalendarCheck },
    { to: "/admin/renewals", label: "Renewals", icon: RotateCcw },
    { to: "/admin/customer-map", label: "Customer Map", icon: Map },
    { to: "/admin/wallet", label: "Wallet & Changes", icon: Wallet },
    { to: "/admin/partners", label: "Partners", icon: Users },
    { to: "/admin/customers", label: "Customers", icon: UserSquare2 },
    { to: "/admin/import", label: "Import Customer", icon: UserPlus },
    { to: "/admin/services", label: "Services", icon: ClipboardList },
    { to: "/admin/photos", label: "Photos", icon: Camera },
    { to: "/admin/payouts", label: "Payouts", icon: Wallet },
    { to: "/admin/settings", label: "Settings", icon: Settings },
  ];
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
          <div className="px-6 py-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">UW</div>
              <span className="font-semibold tracking-tight">Urban Wash</span>
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">Admin Console</p>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              return (
                <Link key={n.to} to={n.to} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${active ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <Icon className="h-4 w-4" />{n.label}
                </Link>
              );
            })}
          </nav>
          <div className="px-6 py-4 text-[11px] text-muted-foreground">
            Mock admin · no auth (MVP)
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <div className="border-b border-border bg-card px-6 py-4 md:hidden">
            <Link to="/" className="inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" /> Urban Wash Admin</Link>
          </div>
          <div className="mx-auto max-w-6xl px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
