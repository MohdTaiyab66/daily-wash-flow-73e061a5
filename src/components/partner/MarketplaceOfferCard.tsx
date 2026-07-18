import { useEffect, useMemo, useState } from "react";
import {
  Car,
  MapPin,
  IndianRupee,
  Route as RouteIcon,
  Calendar,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptMarketplaceOffer,
  declineMarketplaceOffer,
  getPartnerRoutePreview,
} from "@/lib/marketplace.functions";
import { popupDebug, remainingSecondsFrom, traceComponentMount, traceComponentUnmount, traceStateCall } from "@/lib/offer-popup-debug";

type OfferRow = {
  id: string;
  broadcast_id: string;
  round: number;
  incentive: number;
  distance_from_route_m: number | null;
  route_impact_m: number | null;
  broadcast: {
    id: string;
    status: string;
    current_round: number;
    current_incentive: number;
    round_expires_at: string;
    vehicle?: { make?: string; model?: string; registration_number?: string } | null;
    service_area?: { name?: string } | null;
    subscription?: { amount?: number; start_date?: string; renewal_date?: string } | null;
  };
};

function fmtDist(m: number | null) {
  if (m === null || m === undefined) return "—";
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function workingDaysBetween(start?: string, end?: string) {
  if (!start || !end) return 26;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const days = Math.max(1, Math.round((e - s) / 86400000));
  return Math.min(days, 30);
}

/** Circular countdown ring: green → amber → red as the timer drains. */
function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const size = 68;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, total > 0 ? remaining / total : 0));
  const dash = c * pct;
  const color =
    pct > 0.5 ? "text-emerald-500" : pct > 0.2 ? "text-amber-500" : "text-red-500";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-muted/40"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className={`${color} transition-all duration-500 ease-linear`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-bold leading-none ${color}`}>{remaining}</span>
        <span className="text-[10px] font-medium uppercase text-muted-foreground">sec</span>
      </div>
    </div>
  );
}

export function MarketplaceOfferCard({
  offer,
  compact = false,
  onAccept,
  onDecline,
}: {
  offer: OfferRow;
  /** Compact mode is used in the stacked "More offers" list — no route preview. */
  compact?: boolean;
  /** Optional hooks so the parent list can play a success chirp / start the
   * post-decline cooldown when the partner acts on this specific offer. */
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const qc = useQueryClient();
  const accept = useServerFn(acceptMarketplaceOffer);
  const decline = useServerFn(declineMarketplaceOffer);
  const fetchPreview = useServerFn(getPartnerRoutePreview);

  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  const expiresAt = new Date(offer.broadcast.round_expires_at).getTime();
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.round((expiresAt - Date.now()) / 1000)),
  );
  const [total] = useState(() => Math.max(remaining, 30));

  useEffect(() => {
    traceComponentMount("MarketplaceOfferCard", {
      offer_id: offer.id,
      booking_id: (offer as any).broadcast?.booking_id ?? null,
      partner_id: (offer as any).partner_id ?? null,
      status: (offer as any).response ?? null,
      compact,
      route: "/app",
    });
    return () => {
      traceComponentUnmount("MarketplaceOfferCard", {
        offer_id: offer.id,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
        partner_id: (offer as any).partner_id ?? null,
        status: (offer as any).response ?? null,
        compact,
        route: "/app",
      });
    };
  }, [offer.id, compact]);

  useEffect(() => {
    popupDebug("Timer started", {
      component: "MarketplaceOfferCard",
      offer_id: offer.id,
      partner_id: (offer as any).partner_id ?? null,
      booking_id: (offer as any).broadcast?.booking_id ?? null,
      expires_at: offer.broadcast.round_expires_at,
      server_remaining: null,
      client_remaining: remainingSecondsFrom(offer.broadcast.round_expires_at),
      countdown: "500ms",
    });
    const t = setInterval(() => {
      const nextRemaining = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      popupDebug("Timer tick", {
        component: "MarketplaceOfferCard",
        offer_id: offer.id,
        partner_id: (offer as any).partner_id ?? null,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
        expires_at: offer.broadcast.round_expires_at,
        server_remaining: null,
        client_remaining: nextRemaining,
        countdown: nextRemaining,
      });
      traceStateCall("setState", {
        component: "MarketplaceOfferCard",
        function: "timer interval setRemaining",
        reason: "timer tick",
        offer_id: offer.id,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
        partner_id: (offer as any).partner_id ?? null,
        remaining_seconds: nextRemaining,
      });
      setRemaining(nextRemaining);
    }, 500);
    return () => {
      popupDebug("Timer stopped", {
        component: "MarketplaceOfferCard",
        offer_id: offer.id,
        partner_id: (offer as any).partner_id ?? null,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
        client_remaining: remainingSecondsFrom(offer.broadcast.round_expires_at),
      });
      clearInterval(t);
    };
  }, [expiresAt, offer.id, offer.broadcast.round_expires_at]);

  // Route preview — only for the full (top) card, not the stacked compact ones.
  const preview = useQuery({
    queryKey: ["partner-route-preview"],
    queryFn: () => fetchPreview(),
    enabled: !compact,
    staleTime: 30_000,
  });

  const v = offer.broadcast.vehicle;
  const label = v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle" : "Vehicle";
  const areaName = offer.broadcast.service_area?.name ?? "Nearby area";
  const dist = offer.distance_from_route_m ?? null;
  const impact = offer.route_impact_m ?? (dist ? Math.max(50, dist * 2) : null);
  const workingDays = workingDaysBetween(
    offer.broadcast.subscription?.start_date,
    offer.broadcast.subscription?.renewal_date,
  );
  const monthEarnings = Math.round(Number(offer.incentive) * workingDays);
  const finishOffsetMin = useMemo(
    () => (impact ? Math.round((impact / 1000) * 4) : 0),
    [impact],
  );

  const handleAccept = async () => {
    if (busy || accepted) return;
    traceStateCall("setState", { component: "MarketplaceOfferCard", function: "handleAccept setBusy", reason: "accept clicked", offer_id: offer.id, next: true });
    setBusy(true);
    try {
      const res = await accept({ data: { broadcastId: offer.broadcast_id } });
      if (!res.ok) {
        if (res.reason === "already_taken") {
          toast.info("This customer has already been accepted.");
        } else {
          toast.error("Could not accept offer");
        }
      } else {
        traceStateCall("setState", { component: "MarketplaceOfferCard", function: "handleAccept setAccepted", reason: "accept success", offer_id: offer.id, next: true });
        setAccepted(true);
        toast.success(`Accepted — ₹${offer.incentive}/day added to your route`);
        onAccept?.();
      }
      popupDebug("React Query invalidation", {
        component: "MarketplaceOfferCard",
        function: "handleAccept",
        reason: "accept completed",
        query_key: ["marketplace-offers"],
        offer_id: offer.id,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["marketplace-offers"] });
      popupDebug("React Query invalidation", {
        component: "MarketplaceOfferCard",
        function: "handleAccept",
        reason: "accept completed",
        query_key: ["my-assignment"],
        offer_id: offer.id,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["my-assignment"] });
      popupDebug("React Query invalidation", {
        component: "MarketplaceOfferCard",
        function: "handleAccept",
        reason: "accept completed",
        query_key: ["partner-services"],
        offer_id: offer.id,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["partner-services"] });
      popupDebug("React Query invalidation", {
        component: "MarketplaceOfferCard",
        function: "handleAccept",
        reason: "accept completed",
        query_key: ["partner-route-preview"],
        offer_id: offer.id,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["partner-route-preview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to accept");
    } finally {
      traceStateCall("setState", { component: "MarketplaceOfferCard", function: "handleAccept setBusy", reason: "accept completed", offer_id: offer.id, next: false });
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (busy || accepted) return;
    traceStateCall("setState", { component: "MarketplaceOfferCard", function: "handleDecline setBusy", reason: "decline clicked", offer_id: offer.id, next: true });
    setBusy(true);
    try {
      await decline({ data: { broadcastId: offer.broadcast_id } });
      onDecline?.();
      popupDebug("React Query invalidation", {
        component: "MarketplaceOfferCard",
        function: "handleDecline",
        reason: "decline completed",
        query_key: ["marketplace-offers"],
        offer_id: offer.id,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["marketplace-offers"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to decline");
    } finally {
      traceStateCall("setState", { component: "MarketplaceOfferCard", function: "handleDecline setBusy", reason: "decline completed", offer_id: offer.id, next: false });
      setBusy(false);
    }
  };

  // ── Accept animation overlay ────────────────────────────────────────────
  if (accepted) {
    return (
      <div className="animate-scale-in rounded-2xl border-2 border-emerald-500/60 bg-emerald-50 p-6 text-center dark:bg-emerald-950/40">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500 animate-scale-in" />
        <div className="mt-2 text-lg font-bold text-emerald-700 dark:text-emerald-300">
          Customer Assigned
        </div>
        <div className="text-sm text-emerald-700/80 dark:text-emerald-300/80">
          Updating your route…
        </div>
      </div>
    );
  }

  const carsBefore = preview.data?.cars_today ?? 0;
  const earnBefore = preview.data?.earnings_today ?? 0;
  const rate = preview.data?.rate_per_car ?? Number(offer.incentive);
  const earnAfter = earnBefore + Math.round(Number(offer.incentive));
  const carsAfter = carsBefore + 1;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 bg-card shadow-lg ${
        compact ? "border-primary/30" : "border-primary/70 animate-scale-in"
      }`}
    >
      {/* Header bar — Uber-style attention grabber */}
      {!compact && (
        <div className="bg-gradient-to-r from-primary to-primary/80 px-4 py-2 text-primary-foreground">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
            Incoming Customer
          </div>
        </div>
      )}

      <div className="p-4">
        {/* Top row: vehicle + countdown ring */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Car className="h-3.5 w-3.5 text-primary" />
              New Daily Shine Customer
            </div>
            <div className="mt-1 truncate text-xl font-bold">{label}</div>
            {v?.registration_number && (
              <div className="text-xs text-muted-foreground">{v.registration_number}</div>
            )}
          </div>
          {compact ? (
            <div className="text-right">
              <div className="text-sm font-bold text-primary">{remaining}s</div>
            </div>
          ) : (
            <CountdownRing remaining={remaining} total={total} />
          )}
        </div>

        {/* Key stats row */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted/50 px-2.5 py-2">
            <div className="flex items-center gap-1 text-[11px] uppercase text-muted-foreground">
              <MapPin className="h-3 w-3" /> Area
            </div>
            <div className="mt-0.5 truncate font-semibold">{areaName}</div>
            <div className="text-[11px] text-muted-foreground">
              {fmtDist(dist)} from route
            </div>
          </div>
          <div className="rounded-lg bg-primary/10 px-2.5 py-2">
            <div className="flex items-center gap-1 text-[11px] uppercase text-primary/80">
              <IndianRupee className="h-3 w-3" /> Earnings
            </div>
            <div className="mt-0.5 font-bold text-primary">₹{offer.incentive}/day</div>
            <div className="text-[11px] text-muted-foreground">
              ₹{monthEarnings.toLocaleString("en-IN")} · {workingDays}d
            </div>
          </div>
        </div>

        {/* Expandable details */}
        {!compact && (
          <>
            <button
              type="button"
              onClick={() => {
                traceStateCall("setState", { component: "MarketplaceOfferCard", function: "details toggle setExpanded", reason: "details toggle clicked", offer_id: offer.id });
                setExpanded((e) => !e);
              }}
              className="mt-3 flex w-full items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <>
                  Hide details <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Show details <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>

            {expanded && (
              <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3 text-xs animate-fade-in">
                {impact !== null && (
                  <div className="flex items-center gap-2">
                    <RouteIcon className="h-3.5 w-3.5 text-primary" />
                    <span>Adds {fmtDist(impact)} to today's route</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <span>{workingDays} working days assignment</span>
                </div>
                {finishOffsetMin > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>~+{finishOffsetMin} min to finish today's route</span>
                  </div>
                )}

                {/* Route preview: before → after */}
                <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Today's Route
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 font-semibold">
                      <span className="text-muted-foreground">{carsBefore}</span>
                      <span className="text-primary">→</span>
                      <span className="text-primary">{carsAfter} cars</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">
                      Today's Earnings
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 font-semibold">
                      <span className="text-muted-foreground">
                        ₹{earnBefore.toLocaleString("en-IN")}
                      </span>
                      <span className="text-primary">→</span>
                      <span className="text-primary">
                        ₹{earnAfter.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>
                {rate > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    Rate ₹{rate}/car
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {offer.round > 1 && (
          <div className="mt-3 rounded-md bg-amber-100 px-2 py-1 text-center text-xs font-medium text-amber-900">
            Round {offer.round} · Incentive raised
          </div>
        )}

        {/* Big action buttons — Uber-style */}
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="h-12 flex-1 border-2 text-base font-semibold"
            onClick={handleDecline}
            disabled={busy || remaining === 0}
          >
            <X className="mr-1 h-5 w-5" /> Decline
          </Button>
          <Button
            className="h-12 flex-[1.4] bg-emerald-600 text-base font-bold hover:bg-emerald-700"
            onClick={handleAccept}
            disabled={busy || remaining === 0}
          >
            <Check className="mr-1 h-5 w-5" /> Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
