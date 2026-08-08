import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import {
  ArrowLeft,
  Bell,
  Car,
  CheckCheck,
  CreditCard,
  Sparkles,
  Droplets,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/customer/ui/EmptyState";
import { SkeletonList } from "@/components/customer/ui/Skeletons";
import { PullToRefresh } from "@/components/customer/ui/PullToRefresh";
import { ListGroup, Section, Surface } from "@/components/customer/ui/kit";

export const Route = createFileRoute("/c/_authed/notifications")({
  ssr: false,
  head: () => ({ meta: [{ title: "Notifications — Urban Wash" }] }),
  component: NotificationsPage,
});

type Notif = {
  id: string;
  title: string | null;
  body: string | null;
  type: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const TYPE_STYLE: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  partner_assigned: { icon: Car, color: "text-primary", bg: "bg-primary/10" },
  service_started: { icon: Droplets, color: "text-primary", bg: "bg-primary/10" },
  service_completed: { icon: Sparkles, color: "text-success", bg: "bg-success/10" },
  service_skipped: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
  payment_success: { icon: CreditCard, color: "text-success", bg: "bg-success/10" },
  payment_failed: { icon: CreditCard, color: "text-destructive", bg: "bg-destructive/10" },
};

function styleFor(type: string | null) {
  return TYPE_STYLE[type ?? ""] ?? { icon: Bell, color: "text-muted-foreground", bg: "bg-muted" };
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function bucketOf(iso: string): "Today" | "Yesterday" | "Earlier" {
  const d = new Date(iso);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 86400000) return "Yesterday";
  return "Earlier";
}

function NotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["customer-notifications"],
    queryFn: async (): Promise<Notif[]> => {
      const { data, error } = await supabase
        .from("customer_notifications")
        .select("id,title,body,type,link,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  const wasUnread = useRef<Set<string>>(new Set());
  useEffect(() => {
    const unread = (q.data ?? []).filter((n) => !n.read_at);
    if (unread.length === 0) return;
    unread.forEach((n) => wasUnread.current.add(n.id));
    void (async () => {
      await supabase
        .from("customer_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread.map((n) => n.id));
      qc.invalidateQueries({ queryKey: ["customer-notifications-unread"] });
    })();
  }, [q.data, qc]);

  const items = q.data ?? [];

  const groups = useMemo(() => {
    const order: Array<"Today" | "Yesterday" | "Earlier"> = ["Today", "Yesterday", "Earlier"];
    const map = new Map<string, Notif[]>();
    items.forEach((n) => {
      const b = bucketOf(n.created_at);
      map.set(b, [...(map.get(b) ?? []), n]);
    });
    return order.filter((b) => map.has(b)).map((b) => [b, map.get(b)!] as const);
  }, [items]);

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["customer-notifications"] })}>
      <div className="min-h-screen bg-[#FFF9F3] pb-10">
        <div className="sticky top-0 z-20 bg-[#FFF9F3]/95 px-5 pt-6 pb-4 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/c/home"
                className="grid h-10 w-10 place-items-center rounded-2xl bg-white shadow-sm border border-black/5 transition-transform active:scale-90"
              >
                <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
              </Link>
              <h1 className="text-[24px] font-black tracking-tight text-[#1a1a1a]">Notifications</h1>
            </div>
            {items.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-success">
                <CheckCheck className="h-3 w-3" /> All read
              </span>
            )}
          </div>
        </div>

        <div className="px-5">
          {q.isLoading && (
            <div className="mt-8 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Surface key={i} className="h-24 animate-pulse bg-white/50"><div /></Surface>
              ))}
            </div>
          )}

          {!q.isLoading && items.length === 0 && (
            <EmptyState
              className="mt-12"
              icon={Bell}
              tone="primary"
              title="You're all caught up"
              description="Important updates about your service and bookings will appear here."
            />
          )}

          <div className="space-y-8 mt-4">
            {groups.map(([bucket, rows]) => (
              <Section 
                key={bucket} 
                title={<span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60">{bucket}</span>}
              >
                <ListGroup className="bg-transparent border-none space-y-3">
                  {rows.map((n) => {
                    const { icon: Icon, color, bg } = styleFor(n.type);
                    const fresh = wasUnread.current.has(n.id);
                    const clickable = !!n.link;
                    
                    return (
                      <Surface
                        key={n.id}
                        className={cn(
                          "p-0 overflow-hidden transition-all active:scale-[0.98]",
                          fresh ? "border-primary/20 bg-primary/[0.02]" : "border-black/5 bg-white"
                        )}
                      >
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => clickable && navigate({ to: n.link as any })}
                          className={cn(
                            "flex w-full items-start gap-4 p-4 text-left",
                            !clickable && "cursor-default"
                          )}
                        >
                          <div className={cn("mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl", bg, color)}>
                            <Icon className="h-5 w-5" />
                          </div>
                          
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className={cn(
                                "text-[15px] leading-tight tracking-tight",
                                fresh ? "font-black text-[#1a1a1a]" : "font-bold text-[#1a1a1a]/80"
                              )}>
                                {n.title ?? "Update"}
                              </h3>
                              <span className="shrink-0 text-[11px] font-bold text-muted-foreground/50">
                                {clockTime(n.created_at)}
                              </span>
                            </div>
                            
                            {n.body && (
                              <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-relaxed text-muted-foreground/70">
                                {n.body}
                              </p>
                            )}
                            
                            {clickable && (
                              <div className="mt-3 flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-primary">
                                View details <ChevronRight className="h-3 w-3" />
                              </div>
                            )}
                          </div>
                          
                          {fresh && (
                            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(255,107,0,0.5)]" />
                          )}
                        </button>
                      </Surface>
                    );
                  })}
                </ListGroup>
              </Section>
            ))}
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(" ");
}
