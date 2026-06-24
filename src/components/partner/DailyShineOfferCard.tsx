import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, MapPin, IndianRupee, Timer, Car, Clock, Route } from "lucide-react";
import { toast } from "sonner";

/**
 * Daily Shine offer card — rich pre-acceptance context for the partner.
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
        .select(`
          id, queue_id, expires_at,
          distance_m, distance_from_route_m, route_delta_seconds,
          extra_per_day_paise, extra_per_month_paise,
          score, score_breakdown, scope,
          subscription_assignment_queue!inner(
            area, vehicle_category, service_required_before,
            bookings!inner(
              vehicle_id,
              customer_vehicles(make, model, category)
            )
          )
        `)
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscription_offers", filter: `partner_id=eq.${partnerId}` },
        () => qc.invalidateQueries({ queryKey: ["ds-offer", partnerId] }),
      )
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
    onSuccess: (_d, accept) => {
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
  const booking = queue.bookings ?? {};
  const vehicle = booking.customer_vehicles ?? {};

  const vehicleLabel = [vehicle.make, vehicle.model].filter(Boolean).join(" ")
    || (queue.vehicle_category === "sedan_suv" ? "Sedan/SUV" : "Hatchback");
  const areaLabel = queue.area ?? "Nearby area";
  const deadlineLabel = queue.service_required_before
    ? `Before ${queue.service_required_before}`
    : "Before 8:00 AM";
  const distM = offer.distance_from_route_m ?? offer.distance_m ?? 0;
  const distLabel = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`;
  const routeMin = Math.max(1, Math.round((offer.route_delta_seconds ?? 0) / 60));
  const monthlyMin = Math.max(routeMin, Math.round(routeMin * 26)); // ~26 active days
  const perDay = Math.round((offer.extra_per_day_paise ?? 1700) / 100);
  const perMonth = Math.round((offer.extra_per_month_paise ?? 51000) / 100);
  const recommended = Number(offer.score ?? 0) >= 0.75;

  return (
    <Card className="mt-3 border-primary/40 bg-gradient-to-br from-primary/10 to-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-primary/15 p-2"><Sparkles className="h-4 w-4 text-primary" /></div>
          <div>
            <p className="text-sm font-semibold">New Daily Shine Customer</p>
            {recommended && (
              <span className="mt-0.5 inline-block rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
                Recommended for you
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs font-semibold text-primary">
          <Timer className="h-3 w-3" />{remaining}s
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> <span className="font-medium">{deadlineLabel}</span></li>
        <li className="flex items-center gap-2"><Car className="h-4 w-4 text-muted-foreground" /> {vehicleLabel}</li>
        <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {areaLabel}</li>
      </ul>

      <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Route className="h-4 w-4" /> Monthly Route Increase: only +{monthlyMin} mins
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Adds ~{routeMin} min/day · {distLabel} from your route
        </p>
      </div>

      <div className="mt-3 flex items-baseline justify-between rounded-xl bg-success/10 px-3 py-2">
        <div className="flex items-center gap-1.5 text-success">
          <IndianRupee className="h-4 w-4" />
          <span className="text-base font-bold">+₹{perDay}</span>
          <span className="text-xs">/day</span>
        </div>
        <span className="text-xs font-medium text-success">+₹{perMonth.toLocaleString("en-IN")}/month</span>
      </div>

      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => respond.mutate(false)} disabled={respond.isPending}>Decline</Button>
        <Button size="sm" className="flex-1" onClick={() => respond.mutate(true)} disabled={respond.isPending}>Accept</Button>
      </div>
    </Card>
  );
}
