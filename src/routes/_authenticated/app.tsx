import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Home, Briefcase, Wallet, Gift, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { useTodayAssignment } from "@/hooks/use-today-assignment";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="min-h-screen bg-background pb-[calc(64px+env(safe-area-inset-bottom))]">
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
  const qc = useQueryClient();

  usePartnerHeartbeat(partner?.id);
  useFcmRegistration(partner?.id ?? null, "partner");
  usePartnerRouteSync(partner?.id ?? null);
  
  // Authoritative today-assignment sync
  useTodayAssignment();

  // Service handling and invalidation logic
  useEffect(() => {
    const pending = consumePendingLink();
    if (pending) navigate({ to: pending as any });

    const invalidateAll = () => {
      // Sync data state from push events
      qc.invalidateQueries({ queryKey: ["today-assignment"] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["partner-notifications-unread"] });
      qc.invalidateQueries({ queryKey: ["partner-services"] });
      qc.invalidateQueries({ queryKey: ["partner-earnings"] });
      qc.invalidateQueries({ queryKey: ["partner-open-offers-home"] });
      qc.invalidateQueries({ queryKey: ["partner-booking-requests"] });
      qc.invalidateQueries({ queryKey: ["history"] });
    };

    const onLink = (e: Event) => {
      const link = (e as CustomEvent).detail?.link;
      if (typeof link === "string" && link.startsWith("/")) navigate({ to: link as any });
      invalidateAll();
    };

    const onRefresh = () => {
      invalidateAll();
    };

    window.addEventListener("urbanwash:deeplink", onLink);
    window.addEventListener("urbanwash:assignment-refresh", onRefresh);
    return () => {
      window.removeEventListener("urbanwash:deeplink", onLink);
      window.removeEventListener("urbanwash:assignment-refresh", onRefresh);
    };
  }, [navigate, qc]);


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
  const { data: partner } = usePartner();
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

      // Resolve canonical partner identity for realtime sync
      const { data: me } = await supabase
        .from("partners")
        .select("id")
        .or(`id.eq.${u.user.id},phone.eq.${u.user.phone?.replace('91', '') || 'NONE'},email.eq.${u.user.email}`)
        .maybeSingle();

      const partnerId = me?.id || u.user.id;

      (window as any)._supabase_partner_channel = channel = supabase
        .channel(`partner-notif-${partnerId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "partner_notifications", filter: `partner_id=eq.${partnerId}` },
          (payload) => {
            const notif = payload.new as any;
            qc.invalidateQueries({ queryKey: ["partner-notifications-unread"] });
            
            // Trigger invalidation on assignment events.
            if (
              notif?.type === "new_assignment" || 
              notif?.type === "assignment_new" || 
              notif?.type === "new_assignments" || 
              notif?.type === "partner_assigned" ||
              notif?.type === "daily_shine_offer"
            ) {
              qc.invalidateQueries({ queryKey: ["today-assignment"] });
              qc.invalidateQueries({ queryKey: ["route-today"] });
              qc.invalidateQueries({ queryKey: ["partner-open-offers-home"] });
              qc.invalidateQueries({ queryKey: ["partner-booking-requests"] });
              qc.invalidateQueries({ queryKey: ["partner-services"] });
              qc.invalidateQueries({ queryKey: ["partner-earnings"] });
              qc.invalidateQueries({ queryKey: ["history"] });
            }
          })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            qc.invalidateQueries({ queryKey: ["today-assignment"] });
            qc.invalidateQueries({ queryKey: ["route-today"] });
            qc.invalidateQueries({ queryKey: ["partner-notifications-unread"] });
            qc.invalidateQueries({ queryKey: ["partner-services"] });
            qc.invalidateQueries({ queryKey: ["partner-earnings"] });
            qc.invalidateQueries({ queryKey: ["partner-open-offers-home"] });
          }
        });

    })();
    return () => { 
      cancelled = true; 
      if (channel) {
        supabase.removeChannel(channel);
        (window as any)._supabase_partner_channel = null;
      }
    };
  }, [qc, partner?.id]);

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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[rgba(0,0,0,0.04)] bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md items-center justify-around h-[64px] px-4">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className="flex flex-1 flex-col items-center justify-center transition-all group"
            >
              <div
                className={cn(
                  "grid h-[44px] w-[44px] place-items-center rounded-2xl transition-all duration-300",
                  active ? "bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(255,107,0,0.35)] scale-105" : "bg-transparent text-[#8A8A8A] opacity-60"
                )}
              >
                <Icon className="h-[20px] w-[20px]" strokeWidth={1.75} />
              </div>
              <span className={cn(
                "mt-1 text-[13px] font-medium tracking-tight transition-colors",
                active ? "text-[#1A1A1A]" : "text-[#8A8A8A] opacity-60"
              )}>
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
