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
import { popupDebug, remainingSecondsFrom, tracePopupOpen } from "@/lib/offer-popup-debug";

/**
 * Full-screen Daily Shine offer popup with countdown, vibration and ring tone.
 * Mounted globally inside the partner app shell.
 */
export function OfferPopup({ partnerId }: { partnerId: string | null }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [visibleOfferId, setVisibleOfferId] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringTimerRef = useRef<number | null>(null);
  const displayedOfferStatusesRef = useRef<Map<string, string>>(loadStoredOfferStatusMap("uw_displayed_offer_statuses"));
  const dismissedExpiredOfferIdsRef = useRef<Set<string>>(loadStoredOfferIdSet("uw_dismissed_offer_ids"));
  const lastRealtimeStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    popupDebug("OfferPopup mounted", { component: "OfferPopup", partner_id: partnerId });
    return () => {
      popupDebug("OfferPopup unmounted", { component: "OfferPopup", partner_id: partnerId });
    };
  }, [partnerId]);

  const { data: offer } = useQuery({
    queryKey: ["ds-offer-popup", partnerId],
    enabled: !!partnerId,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      popupDebug("Polling fired", {
        component: "OfferPopup",
        function: "get_pending_offer_for_partner",
        reason: "React Query refetchInterval/focus/reconnect/manual",
        partner_id: partnerId,
      });
      // Partner role cannot read bookings/customer_vehicles/customer_addresses via RLS,
      // so use a SECURITY DEFINER RPC that bundles the joined payload.
      const { data, error } = await (supabase as any).rpc("get_pending_offer_for_partner", {
        p_partner_id: partnerId,
      });
      if (error) throw error;
      const nextOffer = (data as any) ?? null;
      popupDebug("Polling result", {
        component: "OfferPopup",
        result_rows: nextOffer?.id ? 1 : 0,
        offer_id: nextOffer?.id ?? null,
        partner_id: partnerId,
        booking_id: nextOffer?.subscription_assignment_queue?.booking_id ?? nextOffer?.booking_id ?? null,
        status: nextOffer?.response ?? null,
        remaining_seconds: nextOffer?._remaining_seconds ?? remainingSecondsFrom(nextOffer?.expires_at),
        server_now: nextOffer?._server_now ?? null,
        expires_at: nextOffer?.expires_at ?? null,
      });
      if (nextOffer?.id) {
        void logOfferClientEvent(nextOffer, "polling_refetch", "useQuery.refetchInterval", {
          server_remaining_seconds: nextOffer._remaining_seconds ?? null,
        });
      }
      return nextOffer;
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
        (payload: any) => {
          const row = (payload.new ?? payload.old ?? {}) as any;
          const offerId = row.id as string | undefined;
          const previousStatus = offerId ? lastRealtimeStatusRef.current.get(offerId) : undefined;
          const nextStatus = row.response as string | undefined;
          popupDebug("subscription_offers changed", {
            component: "OfferPopup",
            function: "supabase.channel(postgres_changes)",
            reason: "realtime_event",
            event: payload.eventType ?? null,
            offer_id: offerId ?? null,
            partner_id: row.partner_id ?? partnerId,
            previous_status: previousStatus ?? null,
            new_status: nextStatus ?? null,
            expires_at: row.expires_at ?? null,
            client_remaining_seconds: remainingSecondsFrom(row.expires_at),
          });
          if (offerId && nextStatus) {
            lastRealtimeStatusRef.current.set(offerId, nextStatus);
            if (previousStatus === nextStatus) {
              void logOfferClientEvent(row, "realtime_event", "subscription_offers.realtime.ignored_identical", {
                event: payload.eventType ?? null,
                previous_status: previousStatus,
                new_status: nextStatus,
              });
              return;
            }
            void logOfferClientEvent(row, "realtime_event", "subscription_offers.realtime", {
              event: payload.eventType ?? null,
              previous_status: previousStatus ?? null,
              new_status: nextStatus,
            });
          }
          popupDebug("React Query invalidation", {
            component: "OfferPopup",
            function: "subscription_offers.realtime handler",
            reason: "subscription_offers changed",
            query_key: ["ds-offer-popup", partnerId],
            offer_id: offerId ?? null,
            previous_status: previousStatus ?? null,
            new_status: nextStatus ?? null,
          });
          qc.invalidateQueries({ queryKey: ["ds-offer-popup", partnerId] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [partnerId, qc]);

  // Tick timer once an offer is on screen
  useEffect(() => {
    if (!offer) return;
    popupDebug("Timer started", {
      component: "OfferPopup",
      offer_id: offer.id,
      partner_id: partnerId,
      booking_id: offer?.subscription_assignment_queue?.booking_id ?? offer?.booking_id ?? null,
      expires_at: offer.expires_at ?? null,
      server_now: offer._server_now ?? null,
      server_remaining: offer._remaining_seconds ?? null,
      client_remaining: remainingSecondsFrom(offer.expires_at),
      countdown: "1000ms",
    });
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      popupDebug("Timer stopped", {
        component: "OfferPopup",
        offer_id: offer.id,
        partner_id: partnerId,
        client_remaining: remainingSecondsFrom(offer.expires_at),
      });
      window.clearInterval(t);
    };
  }, [offer]);

  // Open, ring and vibrate exactly once per offer/status. Realtime, polling,
  // focus refresh and transient null data must not re-open the same pending
  // offer. Timer expiry is a client-only dismissal; backend owns actual retry.
  useEffect(() => {
    if (!offer) {
      stopRing();
      popupDebug("Popup close", {
        component: "OfferPopup",
        function: "offer visibility effect",
        reason: "offer query returned null",
        partner_id: partnerId,
        previous_visible_offer_id: visibleOfferId,
      });
      setVisibleOfferId(null);
      return;
    }

    const status = String(offer.response ?? "pending");
    const expiresAtMs = offer.expires_at ? new Date(offer.expires_at).getTime() : 0;
    const clientRemainingSeconds = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
    const statusKey = `${offer.id}:${status}`;

    if (clientRemainingSeconds <= 0 || dismissedExpiredOfferIdsRef.current.has(offer.id)) {
      popupDebug("Popup close", {
        component: "OfferPopup",
        function: "offer visibility effect",
        reason: clientRemainingSeconds <= 0 ? "client_remaining_seconds <= 0" : "offer_id dismissed in client state",
        offer_id: offer.id,
        partner_id: partnerId,
        booking_id: offer?.subscription_assignment_queue?.booking_id ?? offer?.booking_id ?? null,
        status,
        remaining_seconds: offer._remaining_seconds ?? clientRemainingSeconds,
        server_now: offer._server_now ?? null,
        client_now: new Date().toISOString(),
        expires_at: offer.expires_at ?? null,
      });
      dismissedExpiredOfferIdsRef.current.add(offer.id);
      storeOfferIdSet("uw_dismissed_offer_ids", dismissedExpiredOfferIdsRef.current);
      setVisibleOfferId((current) => (current === offer.id ? null : current));
      stopRing();
      void logOfferClientEvent(offer, "popup_timer_expired", "client_timer", {
        client_now: new Date().toISOString(),
        client_remaining_seconds: clientRemainingSeconds,
        server_now: offer._server_now ?? null,
        server_remaining_seconds: offer._remaining_seconds ?? null,
      });
      return;
    }

    if (displayedOfferStatusesRef.current.has(statusKey)) {
      popupDebug("Popup duplicate ignored", {
        component: "OfferPopup",
        function: "offer visibility effect",
        reason: "offer_id/status already displayed",
        offer_id: offer.id,
        partner_id: partnerId,
        booking_id: offer?.subscription_assignment_queue?.booking_id ?? offer?.booking_id ?? null,
        status,
        remaining_seconds: offer._remaining_seconds ?? clientRemainingSeconds,
        server_now: offer._server_now ?? null,
        client_now: new Date().toISOString(),
      });
      void logOfferClientEvent(offer, "popup_ignored_duplicate", "offer_query_refresh", {
        client_now: new Date().toISOString(),
        client_remaining_seconds: clientRemainingSeconds,
        server_now: offer._server_now ?? null,
        server_remaining_seconds: offer._remaining_seconds ?? null,
      });
      return;
    }

    displayedOfferStatusesRef.current.set(statusKey, new Date().toISOString());
    storeOfferStatusMap("uw_displayed_offer_statuses", displayedOfferStatusesRef.current);
    const openTrace = tracePopupOpen({
      component: "OfferPopup",
      function: "offer visibility effect",
      reason: "new offer query data not previously displayed",
      opened_by: "offer_query_data",
      offer_id: offer.id,
      partner_id: partnerId,
      booking_id: offer?.subscription_assignment_queue?.booking_id ?? offer?.booking_id ?? null,
      status,
      remaining_seconds: offer._remaining_seconds ?? clientRemainingSeconds,
      server_now: offer._server_now ?? null,
      client_now: new Date().toISOString(),
      expires_at: offer.expires_at ?? null,
    });
    setVisibleOfferId(offer.id);
    void logOfferClientEvent(offer, "popup_open", "OfferPopup.useEffect", {
      opened_by: "offer_query_data",
      client_now: new Date().toISOString(),
      client_remaining_seconds: clientRemainingSeconds,
      server_now: offer._server_now ?? null,
      server_remaining_seconds: offer._remaining_seconds ?? null,
      server_txid: offer._server_txid ?? null,
      call_stack: openTrace.call_stack,
    });
    startRing();
    try { navigator.vibrate?.([300, 150, 300, 150, 600]); } catch { /* noop */ }
    return () => stopRing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id, offer?.response, offer?.expires_at]);

  useEffect(() => {
    if (!offer || visibleOfferId !== offer.id) return;
    const expiresAtMs = offer.expires_at ? new Date(offer.expires_at).getTime() : 0;
    const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
    popupDebug("Timer tick", {
      component: "OfferPopup",
      offer_id: offer.id,
      partner_id: partnerId,
      booking_id: offer?.subscription_assignment_queue?.booking_id ?? offer?.booking_id ?? null,
      expires_at: offer.expires_at ?? null,
      server_now: offer._server_now ?? null,
      server_remaining: offer._remaining_seconds ?? null,
      client_remaining: remainingSeconds,
      countdown: remainingSeconds,
    });
    if (remainingSeconds > 0) return;
    popupDebug("Popup close", {
      component: "OfferPopup",
      function: "timer tick effect",
      reason: "timer reached zero",
      offer_id: offer.id,
      partner_id: partnerId,
      booking_id: offer?.subscription_assignment_queue?.booking_id ?? offer?.booking_id ?? null,
      status: offer.response ?? null,
      remaining_seconds: offer._remaining_seconds ?? remainingSeconds,
      server_now: offer._server_now ?? null,
      client_now: new Date().toISOString(),
    });
    dismissedExpiredOfferIdsRef.current.add(offer.id);
    storeOfferIdSet("uw_dismissed_offer_ids", dismissedExpiredOfferIdsRef.current);
    setVisibleOfferId(null);
    stopRing();
    void logOfferClientEvent(offer, "popup_timer_expired", "client_timer_tick", {
      client_now: new Date().toISOString(),
      client_remaining_seconds: remainingSeconds,
      server_now: offer._server_now ?? null,
      server_remaining_seconds: offer._remaining_seconds ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, offer?.id, offer?.expires_at, visibleOfferId]);

  async function logOfferClientEvent(offerLike: any, stage: string, caller: string, meta: Record<string, unknown> = {}) {
    const offerId = offerLike?.id ?? offerLike?.offer_id;
    if (!offerId) return;
    try {
      // eslint-disable-next-line no-console
      console.info("[uw-offer-popup]", stage, { offer_id: offerId, status: offerLike?.response, caller, ...meta });
      await (supabase as any).rpc("log_offer_client_event", {
        p_offer_id: offerId,
        p_stage: stage,
        p_meta: {
          caller,
          path: pathname,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          stack: new Error().stack?.slice(0, 1500) ?? null,
          offer_status: offerLike?.response ?? null,
          ...meta,
        },
      });
    } catch {
      /* best-effort diagnostics only */
    }
  }

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
      await logOfferClientEvent(offer, accept ? "accept_clicked" : "decline_clicked", "OfferPopup.respond", {
        action: accept ? "accept" : "decline",
        client_now: new Date().toISOString(),
      });
      const { data, error } = await (supabase as any).rpc("respond_subscription_offer", { p_offer_id: offer.id, p_accept: accept });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, accept) => {
      stopRing();
      if (offer?.id) {
        dismissedExpiredOfferIdsRef.current.add(offer.id);
        storeOfferIdSet("uw_dismissed_offer_ids", dismissedExpiredOfferIdsRef.current);
        setVisibleOfferId(null);
        void logOfferClientEvent(offer, "client_response_success", "OfferPopup.respond.onSuccess", {
          action: accept ? "accept" : "decline",
          client_now: new Date().toISOString(),
        });
      }
      toast.success(accept ? "Assignment accepted — added to Today's Route" : "Declined");
      popupDebug("React Query invalidation", {
        component: "OfferPopup",
        function: "respond.onSuccess",
        reason: accept ? "accept_success" : "decline_success",
        query_key: ["ds-offer-popup", partnerId],
        offer_id: offer?.id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["ds-offer-popup", partnerId] });
      popupDebug("React Query invalidation", {
        component: "OfferPopup",
        function: "respond.onSuccess",
        reason: accept ? "accept_success" : "decline_success",
        query_key: ["my-assignment"],
        offer_id: offer?.id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["my-assignment"] });
      popupDebug("React Query invalidation", {
        component: "OfferPopup",
        function: "respond.onSuccess",
        reason: accept ? "accept_success" : "decline_success",
        query_key: ["active-assignment-builder"],
        offer_id: offer?.id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["active-assignment-builder"] });
    },
    onError: (e: any) => {
      if (offer?.id) {
        void logOfferClientEvent(offer, "client_response_error", "OfferPopup.respond.onError", {
          error: e?.message ?? String(e),
          client_now: new Date().toISOString(),
        });
      }
      toast.error(e?.message ?? "Could not respond");
    },
  });

  if (!offer || visibleOfferId !== offer.id || pathname.startsWith("/app/service/")) return null;

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

          <button
            type="button"
            className="mt-3 w-full text-center text-xs font-medium text-primary underline underline-offset-2"
            onClick={() => navigate({ to: `/app/leads/${offer.id}` as any })}
          >
            View full lead details →
          </button>
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

function loadStoredOfferStatusMap(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Map<string, string>();
    return new Map<string, string>(JSON.parse(raw));
  } catch {
    return new Map<string, string>();
  }
}

function storeOfferStatusMap(key: string, value: Map<string, string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(value.entries()).slice(-200)));
  } catch {
    /* noop */
  }
}

function loadStoredOfferIdSet(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set<string>();
    return new Set<string>(JSON.parse(raw));
  } catch {
    return new Set<string>();
  }
}

function storeOfferIdSet(key: string, value: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(value).slice(-200)));
  } catch {
    /* noop */
  }
}
