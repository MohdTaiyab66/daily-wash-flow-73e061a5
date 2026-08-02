import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/customer/ui/EmptyState";
import { SkeletonList } from "@/components/customer/ui/Skeletons";
import { PullToRefresh } from "@/components/customer/ui/PullToRefresh";
import { Button } from "@/components/ui/button";

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
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
  useEffect(() => {
    const unread = (q.data ?? []).filter((n) => !n.read_at);
    if (unread.length === 0) return;
    void (async () => {
      await supabase
        .from("customer_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", unread.map((n) => n.id));
      qc.invalidateQueries({ queryKey: ["customer-notifications-unread"] });
    })();
  }, [q.data, qc]);

  const items = q.data ?? [];

  return (
    <PullToRefresh onRefresh={() => qc.invalidateQueries({ queryKey: ["customer-notifications"] })}>
      <div className="px-5 pb-8 pt-6">
        <div className="flex items-center gap-3">
          <Link
            to="/c/home"
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Notifications</h1>
          {items.some((n) => !n.read_at) && (
            <CheckCheck className="ml-auto h-4 w-4 text-success" aria-label="All marked read" />
          )}
        </div>

        <div className="mt-5 space-y-2.5">
          {q.isLoading && <SkeletonList count={4} />}

          {!q.isLoading && items.length === 0 && (
            <EmptyState
              icon={Bell}
              tone="primary"
              title="No notifications yet"
              description="Service updates, partner arrivals and plan reminders will show up here."
              action={
                <Button asChild className="h-11 rounded-full px-7 font-semibold">
                  <Link to="/c/home">Explore services</Link>
                </Button>
              }
            />
          )}

          {items.map((n) => {
            const unread = !n.read_at;
            const clickable = !!n.link;
            return (
              <button
                key={n.id}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && navigate({ to: n.link as any })}
                className={`uw-pressable flex w-full gap-3 rounded-3xl border p-4 text-left ${
                  unread ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-card"
                } ${clickable ? "" : "cursor-default"}`}
              >
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-semibold">{n.title ?? "Update"}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {timeAgo(n.created_at)}
                    </span>
                  </span>
                  {n.body && (
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </PullToRefresh>
  );
}
