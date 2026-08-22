import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, ArrowLeft, CheckCheck, Sparkles, ClipboardList, Wallet, Radio, Settings2, ChevronRight } from "lucide-react";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

export const Route = createFileRoute("/_authenticated/app/notifications")({
  component: NotificationsPage,
});

const TABS = [
  { id: "all", label: "All", icon: Bell, cats: null as string[] | null },
  { id: "daily_shine", label: "Daily Shine", icon: Sparkles, cats: ["daily_shine"] },
  { id: "assignments", label: "Assignments", icon: ClipboardList, cats: ["assignments"] },
  { id: "dar", label: "DAR", icon: Radio, cats: ["dar"] },
  { id: "wallet", label: "Wallet", icon: Wallet, cats: ["wallet", "payments"] },
  { id: "system", label: "System", icon: Settings2, cats: ["system"] },
];

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  
  // Realtime invalidation for the notifications page
  useRealtimeInvalidation(["partner_notifications"], [
    ["partner-notifications"],
    ["partner-notifications-unread"]
  ]);
  const [tab, setTab] = useState<string>("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["partner-notifications"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("partner_notifications")
        .select("id,type,category,title,body,link,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  useEffect(() => {
    let channel: any;
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      channel = supabase
        .channel(`partner-notifications-rt-${u.user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "partner_notifications", filter: `partner_id=eq.${u.user.id}` },
          () => qc.invalidateQueries({ queryKey: ["partner-notifications"] }))
        .subscribe();
    })();
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [qc]);

  const markAll = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("partner_notifications").update({ read_at: new Date().toISOString() })
        .is("read_at", null).eq("partner_id", u.user!.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-notifications"] }),
  });

  const filtered = useMemo(() => {
    const active = TABS.find((t) => t.id === tab);
    if (!active?.cats) return rows ?? [];
    return (rows ?? []).filter((r: any) => active.cats!.includes(r.category ?? "system"));
  }, [rows, tab]);

  const unread = (rows ?? []).filter((r: any) => !r.read_at).length;

  const openNotification = async (n: any) => {
    if (!n.read_at) {
      await supabase.from("partner_notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["partner-notifications"] });
    }
    if (n.link) navigate({ to: n.link as any });
  };

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-32">
      <Link to="/app" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {unread > 0 && (
          <Button size="sm" variant="ghost" onClick={() => markAll.mutate()}>
            <CheckCheck className="mr-1 h-4 w-4" />Mark all read
          </Button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{unread} unread</p>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start">
          {TABS.map((t) => {
            const count = t.cats
              ? (rows ?? []).filter((r: any) => t.cats!.includes(r.category ?? "system") && !r.read_at).length
              : unread;
            return (
              <TabsTrigger key={t.id} value={t.id} className="whitespace-nowrap gap-1.5">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                {count > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{count}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && filtered.length === 0 && (
        <Card className="mt-5 p-6 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No notifications in this category yet.</p>
        </Card>
      )}

      <div className="mt-4 space-y-2">
        {filtered.map((n: any) => {
          const isWork = n.type === 'new_booking' || n.type === 'assignment_released' || n.category === 'daily_shine' || n.category === 'assignments';
          const earnings = n.metadata?.earning_monthly || n.metadata?.monthly_earnings;
          const distance = n.metadata?.distance_display || (n.metadata?.distance_km ? `${n.metadata?.distance_km} km away` : '');
          
          return (
            <Card
              key={n.id}
              className={cn(
                "p-4 cursor-pointer transition-all active:scale-[0.98]",
                n.read_at ? "bg-white border-neutral-100" : "border-primary/30 bg-primary/[0.02]"
              )}
              onClick={() => openNotification(n)}
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  n.read_at ? "bg-neutral-50 text-neutral-400" : "bg-primary/10 text-primary"
                )}>
                  {isWork ? <Sparkles className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className={cn(
                      "text-[15px] tracking-tight truncate",
                      n.read_at ? "font-bold text-neutral-600" : "font-black text-neutral-900"
                    )}>
                      {n.title}
                    </p>
                    {!n.read_at && (
                      <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(255,107,0,0.4)]" />
                    )}
                  </div>
                  
                  {isWork && earnings ? (
                    <div className="flex flex-col gap-1 mb-2">
                      <p className="text-sm font-black text-primary">{earnings}</p>
                      <p className="text-[12px] font-medium text-neutral-500">
                        {n.body} {distance && `· ${distance}`}
                      </p>
                    </div>
                  ) : (
                    n.body && <p className="text-[13px] font-medium text-neutral-500 leading-snug line-clamp-2">{n.body}</p>
                  )}
                  
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {n.link && (
                      <span className="text-[11px] font-black text-primary uppercase tracking-widest flex items-center gap-1">
                        View {isWork ? 'Work' : 'Details'} <ChevronRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
