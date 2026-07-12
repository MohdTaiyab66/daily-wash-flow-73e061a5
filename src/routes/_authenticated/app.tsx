import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, Briefcase, Wallet, Gift, User, Bell } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpeg";
import { useI18n } from "@/lib/i18n";
import { usePartner, usePartnerHeartbeat } from "@/hooks/use-partner";
import { OfferPopup } from "@/components/partner/OfferPopup";
import { DeviceSetupWizard } from "@/components/partner/DeviceSetupWizard";
import { useFcmRegistration } from "@/lib/push/use-fcm-registration";
import { consumePendingLink } from "@/lib/push/fcm";
import { usePartnerRouteSync } from "@/hooks/use-route-sync";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <TopBar />
      <PartnerRuntime />
      <Outlet />
      <BottomNav />
    </div>
  );
}

function PartnerRuntime() {
  const { data: partner } = usePartner();
  const navigate = useNavigate();
  usePartnerHeartbeat(partner?.id);
  useFcmRegistration(partner?.id ?? null, "partner");
  usePartnerRouteSync(partner?.id ?? null);

  // Deep-link from push notifications (background/killed app taps).
  useEffect(() => {
    const pending = consumePendingLink();
    if (pending) navigate({ to: pending as any });
    const onLink = (e: Event) => {
      const link = (e as CustomEvent).detail?.link;
      if (typeof link === "string" && link.startsWith("/")) navigate({ to: link as any });
    };
    window.addEventListener("urbanwash:deeplink", onLink);
    return () => window.removeEventListener("urbanwash:deeplink", onLink);
  }, [navigate]);

  return (
    <>
      <OfferPopup partnerId={partner?.id ?? null} />
      <DeviceSetupWizard />
    </>
  );
}

function TopBar() {
  const { lang, setLang } = useI18n();
  const qc = useQueryClient();
  const { data: unread = 0 } = useQuery({
    queryKey: ["partner-notifications-unread"],
    queryFn: async () => {
      const { data: u, error: userError } = await supabase.auth.getUser();
      if (userError || !u.user) return 0;
      const { count } = await supabase
        .from("partner_notifications")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", u.user.id)
        .is("read_at", null);
      return count ?? 0;
    },
    refetchInterval: 60000,
  });
  useEffect(() => {
    let channel: any;
    let cancelled = false;
    (async () => {
      const { data: u, error } = await supabase.auth.getUser();
      if (error || !u.user || cancelled) return;
      channel = supabase
        .channel(`topbar-notif-${u.user.id}-${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "partner_notifications", filter: `partner_id=eq.${u.user.id}` },
          () => qc.invalidateQueries({ queryKey: ["partner-notifications-unread"] }))
        .subscribe();
    })();
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [qc]);

  return (
    <div className="mx-auto flex max-w-md items-center gap-2 px-5 pt-4">
      <img src={logo} alt="Urban Wash" className="h-9 w-9 rounded-lg object-cover" />
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Urban Wash</p>
        <p className="text-sm font-semibold">Partner</p>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Link to="/app/notifications" className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-border">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Link>
        <div className="inline-flex overflow-hidden rounded-full border border-border text-[11px] font-medium">
          <button
            onClick={() => setLang("en")}
            className={`px-2.5 py-1 ${lang === "en" ? "bg-foreground text-background" : "bg-card text-muted-foreground"}`}
          >EN</button>
          <button
            onClick={() => setLang("hi")}
            className={`px-2.5 py-1 ${lang === "hi" ? "bg-foreground text-background" : "bg-card text-muted-foreground"}`}
          >हिं</button>
        </div>
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
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-full transition-all ${
                  active ? "bg-primary/12 scale-105" : "bg-transparent"
                }`}
              >
                <Icon
                  className="h-5 w-5"
                  {...(active ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
                />
              </span>
              {t.label}
            </Link>
          );
        })}

      </div>
    </nav>
  );
}
