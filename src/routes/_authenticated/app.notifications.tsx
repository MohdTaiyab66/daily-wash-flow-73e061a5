import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, ArrowLeft, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["partner-notifications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("partner_notifications")
        .select("id,type,title,body,link,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  // Subscribe to realtime new rows
  useEffect(() => {
    let channel: any;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      channel = supabase
        .channel("partner-notifications-rt")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "partner_notifications", filter: `partner_id=eq.${u.user.id}` },
          () => qc.invalidateQueries({ queryKey: ["partner-notifications"] }))
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [qc]);

  const markAll = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("partner_notifications").update({ read_at: new Date().toISOString() })
        .is("read_at", null).eq("partner_id", u.user!.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["partner-notifications"] }),
  });

  const unread = (rows ?? []).filter((r: any) => !r.read_at).length;

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

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && (rows?.length ?? 0) === 0 && (
        <Card className="mt-5 p-6 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No notifications yet. You'll see updates here when new customers are added in your area, when an assignment is released or cancelled by admin, and when payouts are released.</p>
        </Card>
      )}

      <div className="mt-4 space-y-2">
        {(rows ?? []).map((n: any) => (
          <Card key={n.id} className={`p-4 ${n.read_at ? "" : "border-primary/40 bg-primary/5"}`}>
            <div className="flex items-start gap-3">
              <Bell className={`mt-0.5 h-4 w-4 ${n.read_at ? "text-muted-foreground" : "text-primary"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{n.title}</p>
                {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{new Date(n.created_at).toLocaleString("en-IN")}</span>
                  {n.link && <Link to={n.link} className="font-medium text-primary">Open →</Link>}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
