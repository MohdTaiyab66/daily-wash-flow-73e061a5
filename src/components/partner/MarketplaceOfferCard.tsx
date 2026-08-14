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
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

  const isRelease = (offer as any).type === "assignment_released";
  const v = offer.broadcast.vehicle;
  const label = isRelease 
    ? `🚗 ${(offer as any).customer_count ?? "Multiple"} Customers` 
    : v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle" : "Vehicle";
  const areaName = (offer as any).area ?? offer.broadcast.service_area?.name ?? "Nearby area";
  const dist = offer.distance_from_route_m ?? null;
  const impact = isRelease ? null : offer.route_impact_m ?? (dist ? Math.max(50, dist * 2) : null);


  
  // Use resolved earning/distance if available (from Push payload or backend enrich)
  // Fallback to existing calculation for backwards compatibility/local UI
  const earningAmount = (offer as any).earning_amount ?? offer.incentive;
  const earningDisplay = (offer as any).earning_monthly ?? (offer as any).earning_display ?? `₹${earningAmount}/day`;
  const distanceDisplay = (offer as any).distance_display ?? fmtDist(offer.distance_from_route_m);


  const workingDays = workingDaysBetween(
    offer.broadcast.subscription?.start_date,
    offer.broadcast.subscription?.renewal_date,
  );
  const monthEarnings = Math.round(Number(earningAmount) * workingDays);

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
        reason: "accept completed — refresh active route sources",
        query_key: ["today-assignment", "route-today"],
        offer_id: offer.id,
        booking_id: (offer as any).broadcast?.booking_id ?? null,
      });
      // Same backend sources the route list and the map read from.
      qc.invalidateQueries({ queryKey: ["today-assignment"] });
      qc.invalidateQueries({ queryKey: ["route-today"] });
      qc.invalidateQueries({ queryKey: ["route-preview"] });
      qc.invalidateQueries({ queryKey: ["cancellability"] });
      qc.invalidateQueries({ queryKey: ["earnings-v3"] });

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
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-white transition-all shadow-sm",
        compact ? "border-neutral-100" : "border-primary/20 animate-scale-in"
      )}
    >
      <div className="p-4">
        {/* Top row: vehicle/customers + countdown ring */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
              <Car className="h-3 w-3 text-primary" />
              {isRelease ? "New Work Available" : "Incoming Offer"}
            </div>
            <div className={cn("truncate text-lg font-bold text-neutral-900", isRelease && "text-primary")}>{label}</div>
            {v?.registration_number && !isRelease && (
              <div className="text-[11px] font-medium text-muted-foreground mt-0.5">
                {v.registration_number}
              </div>
            )}
          </div>
          {compact ? (
            <div className="flex flex-col items-end">
              <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{remaining}s Left</div>
            </div>
          ) : (
            <CountdownRing remaining={remaining} total={total} />
          )}
        </div>

        {/* Key stats grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="bg-neutral-50 rounded-xl p-2.5 border border-neutral-100">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" /> Distance
            </p>
            <p className="text-xs font-bold truncate">{distanceDisplay}</p>
            <p className="text-[10px] text-muted-foreground truncate">{areaName}</p>
          </div>
          <div className="bg-primary/5 rounded-xl p-2.5 border border-primary/10">
            <p className="text-[9px] font-bold uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
              <IndianRupee className="h-2.5 w-2.5" /> Earnings
            </p>
            <p className="text-xs font-bold text-primary">{earningDisplay}</p>
            <p className="text-[10px] text-primary/70">{isRelease ? "Potential Total" : `₹${monthEarnings.toLocaleString("en-IN")} Monthly`}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!compact && (
            <Button
              variant="outline"
              className="flex-1 h-11 rounded-xl font-bold border-neutral-200 text-neutral-600 active:scale-95 transition-all"
              onClick={handleDecline}
              disabled={busy}
            >
              <X className="mr-2 h-4 w-4" />
              Ignore
            </Button>
          )}
          <Button
            className="flex-1 h-11 rounded-xl font-bold bg-neutral-900 text-white active:scale-95 transition-all shadow-md shadow-neutral-100"
            onClick={handleAccept}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                {compact ? "Add" : isRelease ? "View Customers" : "Accept Customer"}
              </>
            )}
          </Button>
        </div>

        {/* Expandable details indicator */}
        {!compact && (
           <button
             type="button"
             onClick={() => setExpanded(!expanded)}
             className="mt-3 w-full flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
           >
             {expanded ? (
               <>Less Details <ChevronUp className="h-3 w-3" /></>
             ) : (
               <>More Details <ChevronDown className="h-3 w-3" /></>
             )}
           </button>
        )}

        {expanded && !compact && (
          <div className="mt-4 space-y-3 pt-4 border-t border-neutral-100 animate-in fade-in slide-in-from-top-2 duration-300">
            {impact !== null && (
               <div className="flex items-center gap-3">
                 <div className="h-8 w-8 rounded-lg bg-neutral-50 flex items-center justify-center border border-neutral-100">
                   <RouteIcon className="h-4 w-4 text-primary" />
                 </div>
                 <div className="flex-1">
                   <p className="text-[9px] font-bold uppercase text-muted-foreground">Route Impact</p>
                   <p className="text-xs font-medium">Adds {fmtDist(impact)} to today's path</p>
                 </div>
               </div>
            )}
            <div className="flex items-center gap-3">
               <div className="h-8 w-8 rounded-lg bg-neutral-50 flex items-center justify-center border border-neutral-100">
                 <Calendar className="h-4 w-4 text-primary" />
               </div>
               <div className="flex-1">
                 <p className="text-[9px] font-bold uppercase text-muted-foreground">Commitment</p>
                 <p className="text-xs font-medium">{workingDays} day assignment</p>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

