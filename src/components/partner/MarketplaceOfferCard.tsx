import { useEffect, useState } from "react";
import { Car, MapPin, Clock, IndianRupee } from "lucide-react";
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
  broadcast: {
    id: string;
    status: string;
    current_round: number;
    current_incentive: number;
    round_expires_at: string;
    vehicle?: { make?: string; model?: string; registration_number?: string } | null;
    service_area?: { name?: string } | null;
  };
};

export function MarketplaceOfferCard({ offer }: { offer: OfferRow }) {
  const qc = useQueryClient();
  const accept = useServerFn(acceptMarketplaceOffer);
  const decline = useServerFn(declineMarketplaceOffer);
  const [busy, setBusy] = useState(false);
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
  const dist = offer.distance_from_route_m ?? null;
  const distLabel = dist === null ? "—" : dist < 1000 ? `${dist} m` : `${(dist / 1000).toFixed(1)} km`;

  const onAccept = async () => {
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
        toast.success(`Accepted — ₹${offer.incentive}/day added to your route`);
      }
      qc.invalidateQueries({ queryKey: ["marketplace-offers"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to accept");
    } finally {
      setBusy(false);
    }
  };

  const onDecline = async () => {
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
          New Daily Shine Customer
        </div>
        <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <Clock className="h-3 w-3" /> {remaining}s
        </div>
      </div>

      <div className="text-base font-semibold">{label}</div>
      {v?.registration_number && (
        <div className="text-xs text-muted-foreground">{v.registration_number}</div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {offer.broadcast.service_area?.name ?? "Area"} · {distLabel}
        </div>
        <div className="flex items-center gap-1 font-semibold text-foreground">
          <IndianRupee className="h-3 w-3" />
          {offer.incentive}/day
        </div>
      </div>

      {offer.round > 1 && (
        <div className="mt-2 rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">
          Round {offer.round} — incentive raised
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button className="flex-1" onClick={onAccept} disabled={busy || remaining === 0}>
          Accept
        </Button>
        <Button variant="outline" className="flex-1" onClick={onDecline} disabled={busy}>
          Decline
        </Button>
      </div>
    </div>
  );
}
