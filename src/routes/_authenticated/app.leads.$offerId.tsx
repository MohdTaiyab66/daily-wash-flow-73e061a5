import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { VehicleImage } from "@/components/VehicleImage";
import {
  Sparkles, MapPin, IndianRupee, Timer, Car, Clock, Route as RouteIcon,
  User as UserIcon, ArrowLeft, Calendar,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/leads/$offerId")({
  component: LeadDetailsPage,
});

function LeadDetailsPage() {
  const { offerId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());

  const { data: offer, isLoading, error } = useQuery({
    queryKey: ["lead-details", offerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_offer_details_by_id", { p_offer_id: offerId });
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 15000,
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const respond = useMutation({
    mutationFn: async (accept: boolean) => {
      const { data, error } = await (supabase as any).rpc("respond_subscription_offer", { p_offer_id: offerId, p_accept: accept });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, accept) => {
      toast.success(accept ? "Assignment accepted — added to Today's Route" : "Declined");
      qc.invalidateQueries({ queryKey: ["ds-offer-popup"] });
      qc.invalidateQueries({ queryKey: ["my-assignment"] });
      qc.invalidateQueries({ queryKey: ["lead-details", offerId] });
      navigate({ to: accept ? "/app/my-assignment" : "/app" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not respond"),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-md px-5 pt-8"><p className="text-sm text-muted-foreground">Loading lead…</p></div>;
  }

  if (error || !offer) {
    return (
      <div className="mx-auto max-w-md px-5 pt-8">
        <Link to="/app/notifications" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <Card className="p-6 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">This lead is no longer available</p>
          <p className="mt-1 text-xs text-muted-foreground">It may have been accepted by another partner or expired.</p>
          <Button className="mt-4" size="sm" onClick={() => navigate({ to: "/app" })}>Back to dashboard</Button>
        </Card>
      </div>
    );
  }

  const expiresAt = offer.expires_at ? new Date(offer.expires_at).getTime() : 0;
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const isPending = offer.response === "pending" && remaining > 0;

  const queue = offer.subscription_assignment_queue ?? {};
  const booking = queue.bookings ?? {};
  const vehicle = booking.customer_vehicles ?? {};
  const address = booking.customer_addresses ?? {};
  const customerName: string | undefined = offer._customer_name ?? undefined;

  const vehicleLabel = [vehicle.make, vehicle.model].filter(Boolean).join(" ")
    || (queue.vehicle_category === "sedan_suv" ? "Sedan / SUV" : "Hatchback");
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

  return (
    <div className="mx-auto max-w-md px-5 pt-5 pb-32">
      <Link to="/app/notifications" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-primary-foreground">
        <Sparkles className="h-5 w-5" />
        <p className="text-sm font-semibold uppercase tracking-[0.14em]">Daily Shine Lead</p>
        {isPending && (
          <div className="ml-auto flex items-center gap-1 rounded-full bg-background/15 px-2.5 py-1 text-xs font-semibold">
            <Timer className="h-3.5 w-3.5" />{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </div>
        )}
      </div>

      {!isPending && (
        <Card className="mt-4 p-4 border-warning/40 bg-warning/10">
          <p className="text-sm font-medium">
            {offer.response === "accepted" ? "You already accepted this lead." :
             offer.response === "declined" ? "You declined this lead." :
             offer.response === "superseded" ? "Another partner accepted this lead." :
             "This lead has expired."}
          </p>
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        <VehicleImage path={vehicle.image_path} className="h-44 w-full" alt={vehicleLabel} />
        <div className="space-y-2 p-4">
          <p className="text-xl font-semibold leading-tight">{vehicleLabel}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {vehicle.color && <span>{vehicle.color}</span>}
            {vehicle.registration_number && <span className="font-mono">{vehicle.registration_number}</span>}
            {customerName && (
              <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" />{customerName}</span>
            )}
          </div>
        </div>
      </Card>

      <Card className="mt-4 space-y-3 p-4">
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
        <div className="flex items-start gap-3">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm font-medium">26 working days / month · ~15 min per car</p>
        </div>
      </Card>

      <Card className="mt-4 border-primary/30 bg-primary/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <RouteIcon className="h-4 w-4" /> {distLabel} from your nearest customer
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Adds only +{routeMin} min to your daily route · ~+{routeMin * 26} min/month total
        </p>
      </Card>

      <Card className="mt-3 bg-success/10 p-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-1.5 text-success">
            <IndianRupee className="h-5 w-5" />
            <span className="text-2xl font-bold">+₹{perDay}</span>
            <span className="text-xs">/day</span>
          </div>
          <span className="text-sm font-semibold text-success">+₹{perMonth.toLocaleString("en-IN")}/month</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Added to your monthly payout for the duration of this subscription.</p>
      </Card>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <Car className="h-3.5 w-3.5" />
        <span>If you accept, this customer is automatically added to My Assignment and Today's Route.</span>
      </div>

      {isPending && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          <div className="mx-auto flex max-w-md gap-3">
            <Button size="lg" variant="outline" className="flex-1" onClick={() => respond.mutate(false)} disabled={respond.isPending}>
              Decline
            </Button>
            <Button size="lg" className="flex-1" onClick={() => respond.mutate(true)} disabled={respond.isPending}>
              Accept
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
