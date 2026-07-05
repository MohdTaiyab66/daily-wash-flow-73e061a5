import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, CheckCheck, Sparkles, ClipboardList, Wallet, ShieldAlert, IndianRupee, Globe } from "lucide-react";

export const Route = createFileRoute("/admin/notifications")({
  component: AdminNotifications,
});

const TABS = [
  { id: "all", label: "All", icon: Bell, cats: null as string[] | null },
  { id: "bookings", label: "Bookings", icon: ClipboardList, cats: ["bookings", "daily_shine"] },
  { id: "premium", label: "Premium", icon: Sparkles, cats: ["premium"] },
  { id: "assignments", label: "Assignments", icon: ClipboardList, cats: ["assignments"] },
  { id: "payments", label: "Payments", icon: IndianRupee, cats: ["payments", "wallet"] },
  { id: "expansion", label: "Expansion", icon: Globe, cats: ["expansion"] },
  { id: "alerts", label: "Alerts", icon: ShieldAlert, cats: ["alerts", "system"] },
];

function AdminNotifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("admin_notifications")
        .select("id,category,title,body,link,metadata,read_at,created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-notifications-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" },
        () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const markAll = useMutation({
    mutationFn: async () => {
      await (supabase as any).from("admin_notifications")
        .update({ read_at: new Date().toISOString() }).is("read_at", null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });

  const filtered = useMemo(() => {
    const active = TABS.find((t) => t.id === tab);
    if (!active?.cats) return rows ?? [];
    return (rows ?? []).filter((r: any) => active.cats!.includes(r.category ?? "bookings"));
  }, [rows, tab]);

  const unread = (rows ?? []).filter((r: any) => !r.read_at).length;

  const openOne = async (n: any) => {
    if (!n.read_at) {
      await (supabase as any).from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
    }
    if (n.link) navigate({ to: n.link as any });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">{unread} unread</p>
        </div>
        {unread > 0 && (
          <Button size="sm" variant="ghost" onClick={() => markAll.mutate()}>
            <CheckCheck className="mr-1 h-4 w-4" />Mark all read
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start">
          {TABS.map((t) => {
            const count = t.cats
              ? (rows ?? []).filter((r: any) => t.cats!.includes(r.category ?? "bookings") && !r.read_at).length
              : unread;
            return (
              <TabsTrigger key={t.id} value={t.id} className="whitespace-nowrap gap-1.5">
                <t.icon className="h-3.5 w-3.5" />{t.label}
                {count > 0 && <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{count}</span>}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && filtered.length === 0 && (
        <Card className="mt-5 p-8 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nothing in this category yet.</p>
        </Card>
      )}

      <div className="mt-4 space-y-2">
        {filtered.map((n: any) => (
          <Card
            key={n.id}
            className={`p-4 cursor-pointer transition-colors ${n.read_at ? "" : "border-primary/40 bg-primary/5"}`}
            onClick={() => openOne(n)}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 rounded-full p-1.5 ${n.read_at ? "bg-muted" : "bg-primary/15"}`}>
                <Bell className={`h-3.5 w-3.5 ${n.read_at ? "text-muted-foreground" : "text-primary"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {n.category}
                  </span>
                </div>
                {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{new Date(n.created_at).toLocaleString("en-IN")}</span>
                  {n.link && <span className="font-medium text-primary">Open →</span>}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
