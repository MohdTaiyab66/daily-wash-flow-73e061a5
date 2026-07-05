import { useEffect, useState } from "react";
import { Car, MapPin, Clock, IndianRupee, Route as RouteIcon, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { acceptMarketplaceOffer, declineMarketplaceOffer } from "@/lib/marketplace.functions";
import { useQueryClient } from "@tanstack/react-query";

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

export function MarketplaceOfferCard({ offer }: { offer: OfferRow }) {
  const qc = useQueryClient();
  const accept = useServerFn(acceptMarketplaceOffer);
  const decline = useServerFn(declineMarketplaceOffer);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.round((new Date(offer.broadcast.round_expires_at).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(
        Math.max(0, Math.round((new Date(offer.broadcast.round_expires_at).getTime() - Date.now()) / 1000))
      );
    }, 1000);
    return () => clearInterval(t);
  }, [offer.broadcast.round_expires_at]);

  const v = offer.broadcast.vehicle;
  const label = v ? `${v.make ?? ""} ${v.model ?? ""}`.trim() || "Vehicle" : "Vehicle";
  const areaName = offer.broadcast.service_area?.name ?? "Nearby area";
  const dist = offer.distance_from_route_m ?? null;
  const impact = offer.route_impact_m ?? (dist ? Math.max(50, dist * 2) : null);
  const workingDays = workingDaysBetween(
    offer.broadcast.subscription?.start_date,
    offer.broadcast.subscription?.renewal_date
  );
  const monthEarnings = Math.round(Number(offer.incentive) * workingDays);

  const onAccept = async () => {
    if (busy || accepted) return;
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
        setAccepted(true);
        toast.success(`Accepted — ₹${offer.incentive}/day added to your route`);
      }
      qc.invalidateQueries({ queryKey: ["marketplace-offers"] });
      qc.invalidateQueries({ queryKey: ["my-assignment"] });
      qc.invalidateQueries({ queryKey: ["partner-services"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to accept");
    } finally {
      setBusy(false);
    }
  };

  const onDecline = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await decline({ data: { broadcastId: offer.broadcast_id } });
      qc.invalidateQueries({ queryKey: ["marketplace-offers"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to decline");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Car className="h-4 w-4 text-primary" />
          🚗 New Daily Shine Customer
        </div>
        <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <Clock className="h-3 w-3" /> {remaining}s
        </div>
      </div>

      <div className="text-base font-semibold">{label}</div>
      {v?.registration_number && (
        <div className="text-xs text-muted-foreground">{v.registration_number}</div>
      )}

      <div className="mt-3 space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span>{areaName} · {fmtDist(dist)} from your route</span>
        </div>
        {impact !== null && (
          <div className="flex items-center gap-1.5 text-primary">
            <RouteIcon className="h-3.5 w-3.5" />
            <span>Adds {fmtDist(impact)} to today's route</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>{workingDays} working days</span>
        </div>
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <IndianRupee className="h-3.5 w-3.5" />
          <span>₹{offer.incentive}/day · ₹{monthEarnings.toLocaleString("en-IN")} total</span>
        </div>
      </div>

      {offer.round > 1 && (
        <div className="mt-2 rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">
          Round {offer.round} — incentive raised
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={onAccept} disabled={busy || accepted || remaining === 0}>
          {accepted ? "Accepted" : busy ? "…" : "Accept"}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onDecline} disabled={busy || accepted}>
          Decline
        </Button>
      </div>
    </div>
  );
}
