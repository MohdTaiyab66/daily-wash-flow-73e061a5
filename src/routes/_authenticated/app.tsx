import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { Home, Briefcase, Wallet, Gift, User } from "lucide-react";
import logo from "@/assets/logo.jpeg";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <TopBar />
      <Outlet />
      <BottomNav />
    </div>
  );
}

function TopBar() {
  return (
    <div className="mx-auto flex max-w-md items-center gap-2 px-5 pt-4">
      <img src={logo} alt="Urban Wash" className="h-9 w-9 rounded-lg object-cover" />
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Urban Wash</p>
        <p className="text-sm font-semibold">Partner</p>
      </div>
    </div>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const tabs: Array<{
    to: "/app" | "/app/assignments" | "/app/earnings" | "/app/rewards" | "/app/profile";
    label: string;
    icon: typeof Home;
    exact?: boolean;
  }> = [
    { to: "/app", label: "Home", icon: Home, exact: true },
    { to: "/app/assignments", label: "Assignments", icon: Briefcase },
    { to: "/app/earnings", label: "Earnings", icon: Wallet },
    { to: "/app/rewards", label: "Rewards", icon: Gift },
    { to: "/app/profile", label: "Profile", icon: User },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex flex-col items-center gap-1 py-3 text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <Icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
