import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { VehicleImage } from "@/components/VehicleImage";
import {
  Sparkles, MapPin, IndianRupee, Timer, Car, Clock, Route, User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Full-screen Daily Shine offer popup with countdown, vibration and ring tone.
 * Mounted globally inside the partner app shell.
 */
export function OfferPopup({ partnerId }: { partnerId: string | null }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const seenOfferRef = useRef<string | null>(null);

  const { data: offer } = useQuery({
    queryKey: ["ds-offer-popup", partnerId],
    enabled: !!partnerId,
    refetchInterval: 15000,
    queryFn: async () => {
      // Partner role cannot read bookings/customer_vehicles/customer_addresses via RLS,
      // so use a SECURITY DEFINER RPC that bundles the joined payload.
      const { data, error } = await (supabase as any).rpc("get_pending_offer_for_partner", {
        p_partner_id: partnerId,
      });
      if (error) throw error;
      return (data as any) ?? null;
    },
  });


  // Realtime: invalidate immediately on insert/update
  useEffect(() => {
    if (!partnerId) return;
    const ch = supabase
      .channel(`ds-offer-popup-${partnerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscription_offers", filter: `partner_id=eq.${partnerId}` },
        () => qc.invalidateQueries({ queryKey: ["ds-offer-popup", partnerId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [partnerId, qc]);

  // Tick timer once an offer is on screen
  useEffect(() => {
    if (!offer) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [offer]);

  // Ring + vibrate when a *new* offer appears
  useEffect(() => {
    if (!offer) {
      stopRing();
      seenOfferRef.current = null;
      return;
    }
    if (seenOfferRef.current === offer.id) return;
    seenOfferRef.current = offer.id;
    startRing();
    try { navigator.vibrate?.([300, 150, 300, 150, 600]); } catch { /* noop */ }
    return () => stopRing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id]);

  function startRing() {
    stopRing();
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!Ctx) return;
      const ctx = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;
      const beep = () => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.4);
      };
      beep();
      ringTimerRef.current = window.setInterval(beep, 1200);
    } catch { /* sound blocked — popup still visible */ }
  }
  function stopRing() {
    if (ringTimerRef.current) { window.clearInterval(ringTimerRef.current); ringTimerRef.current = null; }
    try { navigator.vibrate?.(0); } catch { /* noop */ }
  }

  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      const { data, error } = await (supabase as any).rpc("respond_subscription_offer", { p_offer_id: offer.id, p_accept: accept });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, accept) => {
      stopRing();
      toast.success(accept ? "Assignment accepted — added to Today's Route" : "Declined");
      qc.invalidateQueries({ queryKey: ["ds-offer-popup", partnerId] });
      qc.invalidateQueries({ queryKey: ["my-assignment"] });
      qc.invalidateQueries({ queryKey: ["active-assignment-builder"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not respond"),
  });

  if (!offer || pathname.startsWith("/app/service/")) return null;

  const expiresAt = offer.expires_at ? new Date(offer.expires_at).getTime() : 0;
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const totalWindow = offer.expires_at && offer.offered_at
    ? Math.max(1, Math.round((new Date(offer.expires_at).getTime() - new Date(offer.offered_at).getTime()) / 1000))
    : 90;
  const pct = Math.max(0, Math.min(100, (remaining / totalWindow) * 100));

  const queue = offer.subscription_assignment_queue ?? {};
  const booking = queue.bookings ?? {};
  const vehicle = booking.customer_vehicles ?? {};
  const address = booking.customer_addresses ?? {};
  const customerName: string | undefined = offer._customer_name ?? undefined;

  const vehicleLabel = [vehicle.make, vehicle.model].filter(Boolean).join(" ")
    || (queue.vehicle_category === "sedan_suv" ? "Sedan / SUV" : "Hatchback");
  const colorLabel = vehicle.color || null;
  const regLabel = vehicle.registration_number || null;
  const areaLabel = address.area || queue.area || "Nearby area";
  const addressLine = address.address_line || null;
  const deadlineLabel = queue.service_required_before
    ? `Before ${queue.service_required_before}`
    : "Before 8:00 AM";
  const distM = offer.distance_from_route_m ?? offer.distance_m ?? 0;
  const distLabel = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} m`;
  const routeMin = Math.max(1, Math.round((offer.route_delta_seconds ?? 0) / 60));
  const perDay = Math.round((offer.extra_per_day_paise ?? 1700) / 100);
  const perMonth = Math.round((offer.extra_per_month_paise ?? perDay * 30) / 100);
  const recommended = Number(offer.score ?? 0) >= 0.75;

  return (
    <Dialog open={!!offer} onOpenChange={() => { /* not user-dismissable */ }}>
      <DialogContent
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-none gap-0 overflow-y-auto rounded-none border-0 bg-background p-0 sm:rounded-none"
        // Prevent close on outside/escape — partner must Accept or Decline
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <DialogTitle>New Daily Shine Offer</DialogTitle>
          <DialogDescription>Review the offer details and accept or decline before the countdown ends.</DialogDescription>
        </VisuallyHidden>
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border bg-primary px-5 pb-3 pt-5 text-primary-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 animate-pulse" />
            <p className="text-sm font-semibold uppercase tracking-[0.18em]">New Daily Shine Offer</p>
            <div className="ml-auto flex items-center gap-1 rounded-full bg-background/15 px-2.5 py-1 text-xs font-semibold">
              <Timer className="h-3.5 w-3.5" />{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/20">
            <div
              className="h-full bg-background transition-all duration-1000 ease-linear"
              style={{ width: `${pct}%` }}
            />
          </div>
          {recommended && (
            <span className="mt-2 inline-block rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success-foreground">
              Recommended for you
            </span>
          )}
        </div>

        {/* Body */}
        <div className="mx-auto w-full max-w-md px-5 pb-6 pt-5">
          {/* Vehicle hero */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <VehicleImage
              path={vehicle.image_path}
              className="h-44 w-full"
              alt={vehicleLabel}
            />
            <div className="space-y-1 p-4">
              <p className="text-xl font-semibold leading-tight">{vehicleLabel}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {colorLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ background: colorLabel.toLowerCase() }} />
                    {colorLabel}
                  </span>
                )}
                {regLabel && <span className="font-mono">{regLabel}</span>}
                {customerName && (
                  <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" />{customerName}</span>
                )}
              </div>
            </div>
          </div>

          {/* Location & timing */}
          <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">{areaLabel}</p>
                {addressLine && <p className="text-xs text-muted-foreground">{addressLine}</p>}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-sm font-medium">{deadlineLabel}</p>
            </div>
          </div>

          {/* Route impact */}
          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Route className="h-4 w-4" /> Only +{routeMin} min/day on your route
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {distLabel} from your current route · ~+{routeMin * 26} min/month total
            </p>
          </div>

          {/* Earnings */}
          <div className="mt-3 rounded-2xl bg-success/10 p-4">
            <div className="flex items-baseline justify-between">
              <div className="flex items-center gap-1.5 text-success">
                <IndianRupee className="h-5 w-5" />
                <span className="text-2xl font-bold">+₹{perDay}</span>
                <span className="text-xs">/day</span>
              </div>
              <span className="text-sm font-semibold text-success">+₹{perMonth.toLocaleString("en-IN")}/month</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Added to your monthly payout for the duration of this subscription.</p>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Car className="h-3.5 w-3.5" />
            <span>If you accept, this customer is automatically added to My Assignment and Today's Route.</span>
          </div>
        </div>

        {/* Sticky action bar */}
        <div className="sticky bottom-0 z-10 border-t border-border bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          <div className="mx-auto flex max-w-md gap-3">
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => respond.mutate(false)}
              disabled={respond.isPending}
            >
              Decline
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => respond.mutate(true)}
              disabled={respond.isPending}
            >
              Accept
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
