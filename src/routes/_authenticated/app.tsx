import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { Home, Briefcase, Wallet, Gift, User, Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpeg";
import { useI18n } from "@/lib/i18n";

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
  const { lang, setLang } = useI18n();
  return (
    <div className="mx-auto flex max-w-md items-center gap-2 px-5 pt-4">
      <img src={logo} alt="Urban Wash" className="h-9 w-9 rounded-lg object-cover" />
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Urban Wash</p>
        <p className="text-sm font-semibold">Partner</p>
      </div>
      <div className="ml-auto inline-flex overflow-hidden rounded-full border border-border text-[11px] font-medium">
        <button
          onClick={() => setLang("en")}
          className={`px-2.5 py-1 ${lang === "en" ? "bg-foreground text-background" : "bg-card text-muted-foreground"}`}
        >
          EN
        </button>
        <button
          onClick={() => setLang("hi")}
          className={`px-2.5 py-1 ${lang === "hi" ? "bg-foreground text-background" : "bg-card text-muted-foreground"}`}
        >
          हिं
        </button>
      </div>
    </div>
  );
}

function BottomNav() {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const tabs: Array<{
    to: "/app" | "/app/assignments" | "/app/earnings" | "/app/rewards" | "/app/profile";
    label: string;
    icon: typeof Home;
    exact?: boolean;
  }> = [
    { to: "/app", label: t("home"), icon: Home, exact: true },
    { to: "/app/assignments", label: t("assignments"), icon: Briefcase },
    { to: "/app/earnings", label: t("earnings"), icon: Wallet },
    { to: "/app/rewards", label: t("rewards"), icon: Gift },
    { to: "/app/profile", label: t("profile"), icon: User },
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
