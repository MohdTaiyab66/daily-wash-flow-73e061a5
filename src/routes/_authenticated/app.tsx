import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { Home, Car, Wallet, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen bg-background pb-20">
      <Outlet />
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const tabs: Array<{ to: "/app" | "/app/cars" | "/app/earnings" | "/app/profile"; label: string; icon: typeof Home; exact?: boolean }> = [
    { to: "/app", label: "Home", icon: Home, exact: true },
    { to: "/app/cars", label: "Cars", icon: Car },
    { to: "/app/earnings", label: "Earnings", icon: Wallet },
    { to: "/app/profile", label: "Profile", icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className={`flex flex-col items-center gap-1 py-3 text-[11px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
