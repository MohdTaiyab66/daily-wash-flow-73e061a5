import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, MapPin, IndianRupee, Timer } from "lucide-react";
import { toast } from "sonner";

/**
 * Shows the active Daily Shine offer for the current partner.
 * Realtime updates + 90s countdown.
 */
export function DailyShineOfferCard({ partnerId }: { partnerId: string | null }) {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());

  const { data: offer } = useQuery({
    queryKey: ["ds-offer", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscription_offers")
        .select("id, queue_id, expires_at, distance_m, projected_extra_earnings, scope, subscription_assignment_queue!inner(area, vehicle_category)")
        .eq("partner_id", partnerId)
        .eq("response", "pending")
        .order("offered_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as any;
    },
  });

  useEffect(() => {
    if (!partnerId) return;
    const ch = supabase
      .channel(`ds-offer-${partnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_offers", filter: `partner_id=eq.${partnerId}` }, () => {
        qc.invalidateQueries({ queryKey: ["ds-offer", partnerId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [partnerId, qc]);

  useEffect(() => {
    if (!offer) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [offer]);

  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      const { data, error } = await (supabase as any).rpc("respond_subscription_offer", { p_offer_id: offer.id, p_accept: accept });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, accept) => {
      toast.success(accept ? "Customer added to your route" : "Declined");
      qc.invalidateQueries({ queryKey: ["ds-offer", partnerId] });
      qc.invalidateQueries({ queryKey: ["active-assignment-builder"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not respond"),
  });

  if (!offer) return null;

  const expiresAt = offer.expires_at ? new Date(offer.expires_at).getTime() : 0;
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const queue = offer.subscription_assignment_queue ?? {};
  const distKm = offer.distance_m ? (offer.distance_m / 1000).toFixed(1) : "—";

  return (
    <Card className="mt-3 border-primary/40 bg-gradient-to-br from-primary/10 to-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-primary/15 p-2"><Sparkles className="h-4 w-4 text-primary" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">New Daily Shine Customer Available</p>
          <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {queue.area ?? "Nearby"} · {distKm} km from you · {queue.vehicle_category === "sedan_suv" ? "Sedan/SUV" : "Hatchback"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
            <IndianRupee className="h-3 w-3" /> ~₹{offer.projected_extra_earnings ?? 0}/mo additional earnings
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-xs font-medium text-primary"><Timer className="h-3 w-3" />{remaining}s</div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => respond.mutate(false)} disabled={respond.isPending}>Decline</Button>
        <Button size="sm" className="flex-1" onClick={() => respond.mutate(true)} disabled={respond.isPending}>Accept</Button>
      </div>
    </Card>
  );
}
