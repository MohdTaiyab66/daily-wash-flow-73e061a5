import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/marketplace")({
  component: MarketplacePage,
});

type QueueRow = {
  id: string;
  customer_id: string;
  area: string | null;
  vehicle_category: string | null;
  service_required_before: string | null;
  status: string;
  radius_km: number | null;
  current_offer_partner_id: string | null;
  assigned_partner_id: string | null;
  locked_partner_id: string | null;
  lock_until: string | null;
  tried_partner_ids: string[] | null;
  created_at: string;
  updated_at: string;
  booking_id: string;
};

const TABS: Array<{ key: string; label: string; match: (q: QueueRow, hasLiveOffer: boolean) => boolean }> = [
  { key: "awaiting", label: "Awaiting", match: (q, live) => ["awaiting", "queued"].includes(q.status) && !live },
  { key: "offered", label: "Offered", match: (q, live) => q.status === "offered" || (["awaiting", "queued"].includes(q.status) && live) },
  { key: "broadcasted", label: "Broadcasted", match: (q) => ["offered", "awaiting", "queued"].includes(q.status) && (q.radius_km ?? 0) >= 15 },
  { key: "assigned", label: "Assigned", match: (q) => q.status === "assigned" },
  { key: "failed", label: "Failed / Timed out", match: (q) => q.status === "failed" || q.status === "timed_out" },
];

type MarketplaceContext = {
  customers: Map<string, { full_name: string | null; phone: string | null; preferred_area: string | null }>;
  subscriptions: Map<string, { status: string; start_date: string; renewal_date: string; amount: number }>;
  offers: Map<string, Array<{ partner_id: string; response: string; score: number | null; expires_at: string | null; offered_at: string }>>;
  partners: Map<string, { full_name: string | null; partner_code: string | null; rating: number | null }>;
};

function MarketplacePage() {
  const qc = useQueryClient();
  const { data: queue, isLoading } = useQuery({
    queryKey: ["admin-marketplace-queue"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscription_assignment_queue")
        .select("id, booking_id, customer_id, area, vehicle_category, service_required_before, status, radius_km, current_offer_partner_id, assigned_partner_id, locked_partner_id, lock_until, tried_partner_ids, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as QueueRow[];
    },
    refetchInterval: 15000,
  });

  const { data: liveOffers } = useQuery({
    queryKey: ["admin-marketplace-live-offers"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscription_offers")
        .select("queue_id, partner_id, score, expires_at, response")
        .eq("response", "pending");
      return (data ?? []) as Array<{ queue_id: string; partner_id: string; score: number | null; expires_at: string; response: string }>;
    },
    refetchInterval: 10000,
  });

  const { data: context } = useQuery({
    queryKey: ["admin-marketplace-context", (queue ?? []).map((q) => q.id).join(",")],
    enabled: !!queue,
    queryFn: async (): Promise<MarketplaceContext> => {
      const customerIds = Array.from(new Set((queue ?? []).map((q) => q.customer_id)));
      const bookingIds = Array.from(new Set((queue ?? []).map((q) => q.booking_id)));
      const partnerIds = Array.from(new Set((queue ?? []).flatMap((q) => [q.current_offer_partner_id, q.assigned_partner_id].filter(Boolean) as string[])));

      const [customersQ, subsQ, offersQ, partnersQ] = await Promise.all([
        customerIds.length
          ? (supabase as any).from("customer_profiles").select("user_id, full_name, phone, preferred_area").in("user_id", customerIds)
          : Promise.resolve({ data: [] }),
        bookingIds.length
          ? (supabase as any).from("subscriptions").select("booking_id, status, start_date, renewal_date, amount").in("booking_id", bookingIds)
          : Promise.resolve({ data: [] }),
        (queue ?? []).length
          ? (supabase as any).from("subscription_offers").select("queue_id, partner_id, response, score, expires_at, offered_at").in("queue_id", (queue ?? []).map((q) => q.id)).order("offered_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        partnerIds.length
          ? (supabase as any).from("partners").select("id, full_name, partner_code, rating").in("id", partnerIds)
          : Promise.resolve({ data: [] }),
      ]);

      const offers = new Map<string, Array<{ partner_id: string; response: string; score: number | null; expires_at: string | null; offered_at: string }>>();
      (offersQ.data ?? []).forEach((o: any) => {
        const list = offers.get(o.queue_id) ?? [];
        list.push(o);
        offers.set(o.queue_id, list);
      });

      return {
        customers: new Map((customersQ.data ?? []).map((c: any) => [c.user_id, c])),
        subscriptions: new Map((subsQ.data ?? []).map((s: any) => [s.booking_id, s])),
        offers,
        partners: new Map((partnersQ.data ?? []).map((p: any) => [p.id, p])),
      };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-marketplace")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_assignment_queue" },
        () => qc.invalidateQueries({ queryKey: ["admin-marketplace-queue"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_offers" },
        () => qc.invalidateQueries({ queryKey: ["admin-marketplace-live-offers"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const liveByQueue = new Map<string, { partner_id: string; expires_at: string }>();
  (liveOffers ?? []).forEach(o => liveByQueue.set(o.queue_id, { partner_id: o.partner_id, expires_at: o.expires_at }));

  const buckets: Record<string, QueueRow[]> = {};
  TABS.forEach(t => { buckets[t.key] = []; });
  (queue ?? []).forEach(q => {
    const live = liveByQueue.has(q.id);
    for (const t of TABS) {
      if (t.match(q, live)) { buckets[t.key].push(q); break; }
    }
  });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Daily Shine Marketplace</h1>
      <p className="mt-1 text-sm text-muted-foreground">Live view of subscription assignment queue, partner offers, and lock state.</p>

      {isLoading ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TABS.map(tab => (
            <Card key={tab.key} className="p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{tab.label}</h2>
                <Badge variant="secondary">{buckets[tab.key].length}</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {buckets[tab.key].length === 0 && (
                  <p className="text-xs text-muted-foreground">No items.</p>
                )}
                {buckets[tab.key].slice(0, 25).map(q => {
                  const live = liveByQueue.get(q.id);
                  const ageMin = Math.round((Date.now() - new Date(q.created_at).getTime()) / 60000);
                  const customer = context?.customers.get(q.customer_id);
                  const sub = context?.subscriptions.get(q.booking_id);
                  const offerList = context?.offers.get(q.id) ?? [];
                  const currentPartner = q.assigned_partner_id || live?.partner_id || q.current_offer_partner_id;
                  const partner = currentPartner ? context?.partners.get(currentPartner) : null;
                  const latestOffer = offerList[0];
                  return (
                    <div
                      key={q.id}
                      className="block rounded-lg border border-border p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                         <span className="font-medium">{customer?.full_name ?? "Customer"}</span>
                        <span className="text-muted-foreground">{ageMin}m ago</span>
                      </div>
                       <div className="mt-0.5 text-[11px] text-muted-foreground">
                         {q.area ?? customer?.preferred_area ?? "Unknown area"}{customer?.phone ? ` · +91 ${customer.phone}` : ""}
                       </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                         <span className="capitalize">{q.status.replaceAll("_", " ")}</span>
                        <span>{q.vehicle_category ?? "—"}</span>
                        {q.service_required_before && <span>· before {q.service_required_before}</span>}
                        <span>· radius {q.radius_km ?? 2}km</span>
                        {q.tried_partner_ids && q.tried_partner_ids.length > 0 && (
                          <span>· {q.tried_partner_ids.length} tried</span>
                        )}
                      </div>
                       {sub && (
                         <div className="mt-1 text-[11px] text-muted-foreground">
                           Subscription {sub.status.replaceAll("_", " ")} · ₹{Number(sub.amount).toLocaleString("en-IN")} · renews {new Date(sub.renewal_date).toLocaleDateString("en-IN")}
                         </div>
                       )}
                      {live && (
                        <div className="mt-1 text-[11px] text-primary">
                           Offered → {partner?.full_name ?? live.partner_id.slice(0, 8)} (expires {new Date(live.expires_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })})
                        </div>
                      )}
                       {!live && latestOffer && (
                         <div className="mt-1 text-[11px] text-muted-foreground">
                           Last offer {latestOffer.response} → {partner?.full_name ?? latestOffer.partner_id.slice(0, 8)}{latestOffer.score != null ? ` · score ${Math.round(Number(latestOffer.score) * 100)}` : ""}
                         </div>
                       )}
                      {q.lock_until && q.status === "assigned" && (
                        <div className="mt-1 text-[11px] text-success">
                          Locked until {new Date(q.lock_until).toLocaleDateString("en-IN")}
                        </div>
                      )}
                     </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
