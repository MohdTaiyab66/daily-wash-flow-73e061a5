import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

export const Route = createFileRoute("/admin/offer-history")({
  component: OfferHistoryPage,
});

type OfferRow = {
  id: string;
  queue_id: string;
  partner_id: string;
  scope: string;
  response: string;
  offered_at: string;
  responded_at: string | null;
  expires_at: string | null;
  distance_m: number | null;
  distance_from_route_m: number | null;
  route_delta_seconds: number | null;
  extra_per_day_paise: number | null;
  score: number | null;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "timeout", label: "Timed out" },
  { key: "superseded", label: "Superseded" },
  { key: "pending", label: "Pending" },
];

function OfferHistoryPage() {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const { data: offers, isLoading } = useQuery({
    queryKey: ["admin-offer-history", filter],
    queryFn: async () => {
      let req = (supabase as any)
        .from("subscription_offers")
        .select("id, queue_id, partner_id, scope, response, offered_at, responded_at, expires_at, distance_m, distance_from_route_m, route_delta_seconds, extra_per_day_paise, score")
        .order("offered_at", { ascending: false })
        .limit(300);
      if (filter !== "all") req = req.eq("response", filter);
      const { data } = await req;
      return (data ?? []) as OfferRow[];
    },
    refetchInterval: 15000,
  });

  const partnerIds = useMemo(() => Array.from(new Set((offers ?? []).map((o) => o.partner_id))), [offers]);
  const { data: partners } = useQuery({
    queryKey: ["admin-offer-history-partners", partnerIds.sort().join(",")],
    enabled: partnerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("partners")
        .select("id, full_name, phone")
        .in("id", partnerIds);
      const map = new Map<string, { full_name: string | null; phone: string | null }>();
      for (const p of data ?? []) map.set(p.id, { full_name: p.full_name, phone: p.phone });
      return map;
    },
  });

  const filtered = useMemo(() => {
    const list = offers ?? [];
    if (!q.trim()) return list;
    const needle = q.trim().toLowerCase();
    return list.filter((o) => {
      const p = partners?.get(o.partner_id);
      return (
        p?.full_name?.toLowerCase().includes(needle) ||
        p?.phone?.includes(needle) ||
        o.queue_id.toLowerCase().includes(needle) ||
        o.partner_id.toLowerCase().includes(needle)
      );
    });
  }, [offers, partners, q]);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Offer History</h1>
          <p className="text-sm text-muted-foreground">Every offer dispatched to partners — most recent first.</p>
        </div>
        <Link to="/admin/marketplace" className="text-sm text-primary hover:underline">← Marketplace</Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search partner / queue id"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-64 pl-7 text-xs"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="mt-10 flex items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</div>
      ) : filtered.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-sm text-muted-foreground">No offers match this filter.</Card>
      ) : (
        <div className="mt-4 space-y-2">
          {filtered.map((o) => {
            const p = partners?.get(o.partner_id);
            const dist = (o.distance_from_route_m ?? o.distance_m ?? 0);
            return (
              <Card key={o.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-[180px]">
                  <p className="text-sm font-semibold">{p?.full_name ?? "Partner"}</p>
                  <p className="text-xs text-muted-foreground">{p?.phone ?? o.partner_id.slice(0, 8)}</p>
                </div>
                <ResponseBadge response={o.response} />
                <Badge variant="outline" className="text-[10px] uppercase">{o.scope}</Badge>
                <div className="text-xs text-muted-foreground">
                  Score <span className="font-medium text-foreground">{o.score != null ? Number(o.score).toFixed(2) : "—"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist} m`} off route
                </div>
                <div className="text-xs text-muted-foreground">
                  +{Math.max(1, Math.round((o.route_delta_seconds ?? 0) / 60))} min/day
                </div>
                <div className="text-xs text-muted-foreground">
                  +₹{Math.round((o.extra_per_day_paise ?? 0) / 100)}/day
                </div>
                <div className="ml-auto text-right text-[11px] text-muted-foreground">
                  <p>Offered {new Date(o.offered_at).toLocaleString()}</p>
                  {o.responded_at && <p>Responded {new Date(o.responded_at).toLocaleString()}</p>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResponseBadge({ response }: { response: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    accepted: { label: "Accepted", cls: "bg-success/15 text-success border-success/30" },
    declined: { label: "Declined", cls: "bg-destructive/15 text-destructive border-destructive/30" },
    timeout: { label: "Timed out", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    superseded: { label: "Superseded", cls: "bg-muted text-muted-foreground border-border" },
    pending: { label: "Pending", cls: "bg-primary/15 text-primary border-primary/30" },
  };
  const m = map[response] ?? { label: response, cls: "bg-muted text-muted-foreground border-border" };
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.cls}`}>{m.label}</span>;
}
