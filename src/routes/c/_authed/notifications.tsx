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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/customer/ui/EmptyState";
import { SkeletonList } from "@/components/customer/ui/Skeletons";
import { PullToRefresh } from "@/components/customer/ui/PullToRefresh";

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

/** Presentation-only mapping from notification type to icon + tint. */
const TYPE_STYLE: Record<string, { icon: LucideIcon; cls: string }> = {
  partner_assigned: { icon: Car, cls: "bg-primary/12 text-primary" },
  service_started: { icon: Droplets, cls: "bg-primary/12 text-primary" },
  service_completed: { icon: Sparkles, cls: "bg-success/12 text-success" },
  service_skipped: { icon: AlertTriangle, cls: "bg-warning/20 text-warning-foreground" },
  payment_success: { icon: CreditCard, cls: "bg-success/12 text-success" },
  payment_failed: { icon: CreditCard, cls: "bg-destructive/10 text-destructive" },
};

function styleFor(type: string | null) {
  return TYPE_STYLE[type ?? ""] ?? { icon: Bell, cls: "bg-muted text-muted-foreground" };
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

  // Opening the centre marks everything read — the bell badge clears with it.
  // We snapshot the ids that were unread on arrival so the user still sees
  // which items are new for this visit.
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
      <div className="px-5 pt-6">
        <div className="flex items-center gap-3">
          <Link
            to="/c/home"
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-full border border-border/70 bg-card"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-[22px] font-bold tracking-tight">Notifications</h1>
          {items.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
              <CheckCheck className="h-4 w-4 text-success" /> All read
            </span>
          )}
        </div>

        {q.isLoading && <div className="mt-6"><SkeletonList count={4} /></div>}

        {!q.isLoading && items.length === 0 && (
          <EmptyState
            className="mt-14"
            icon={Bell}
            tone="primary"
            title="You're all caught up"
            description="We'll let you know when something important happens."
          />
        )}

        {groups.map(([bucket, rows]) => (
          <section key={bucket} className="mt-6">
            <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {bucket}
            </h2>
            <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
              {rows.map((n) => {
                const { icon: Icon, cls } = styleFor(n.type);
                const fresh = wasUnread.current.has(n.id);
                const clickable = !!n.link;
                return (
                  <button
                    key={n.id}
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && navigate({ to: n.link as any })}
                    className={`uw-pressable flex w-full items-start gap-3 px-4 py-3.5 text-left ${
                      clickable ? "active:bg-muted/50" : "cursor-default"
                    }`}
                  >
                    <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${cls}`}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
                          {n.title ?? "Update"}
                        </span>
                        {fresh && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[11.5px] text-muted-foreground/80">
                        {clockTime(n.created_at)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </PullToRefresh>
  );
}
