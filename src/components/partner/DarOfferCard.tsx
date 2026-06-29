import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

type Offer = {
  id: string;
  event_id: string;
  service_ids: string[];
  service_count: number;
  extra_distance_km: number;
  extra_time_min: number;
  extra_monthly_earnings: number;
  expires_at: string;
  status: string;
};

export function DarOfferCard() {
  const qc = useQueryClient();
  const [partnerId, setPartnerId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setPartnerId(data.user?.id ?? null));
  }, []);

  const { data: offer } = useQuery({
    queryKey: ["dar-active-offer", partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dar_offers")
        .select("id,event_id,service_ids,service_count,extra_distance_km,extra_time_min,extra_monthly_earnings,expires_at,status")
        .eq("partner_id", partnerId!)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data ?? null) as Offer | null;
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (!partnerId) return;
    const ch = supabase
      .channel("dar-offer-" + partnerId + "-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "dar_offers", filter: `partner_id=eq.${partnerId}` },
        () => qc.invalidateQueries({ queryKey: ["dar-active-offer", partnerId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [partnerId, qc]);

  if (!offer) return null;

  const accept = async () => {
    const { error } = await supabase.rpc("dar_accept_offer", { p_offer_id: offer.id, p_service_ids: offer.service_ids });
    if (error) { toast.error(error.message); return; }
    toast.success(`Accepted ${offer.service_count} extra customers`);
    qc.invalidateQueries({ queryKey: ["dar-active-offer", partnerId] });
    qc.invalidateQueries({ queryKey: ["route-today"] });
    qc.invalidateQueries({ queryKey: ["my-assignment"] });
  };
  const ignore = async () => {
    const { error } = await supabase.rpc("dar_ignore_offer", { p_offer_id: offer.id });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["dar-active-offer", partnerId] });
  };

  return (
    <Card data-testid="dar-offer-card" className="border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Extra customers available</h3>
        <Badge variant="secondary" className="ml-auto">{offer.service_count} stops</Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-background p-2">
          <p className="text-muted-foreground">Extra / month</p>
          <p className="text-sm font-semibold">₹{Math.round(offer.extra_monthly_earnings)}</p>
        </div>
        <div className="rounded-md bg-background p-2">
          <p className="text-muted-foreground">Extra travel</p>
          <p className="text-sm font-semibold">{offer.extra_distance_km} km</p>
        </div>
        <div className="rounded-md bg-background p-2">
          <p className="text-muted-foreground">Extra time</p>
          <p className="text-sm font-semibold">{offer.extra_time_min} min</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={accept}>Accept all</Button>
        <Button size="sm" variant="outline" onClick={ignore}>Ignore</Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Expires {new Date(offer.expires_at).toLocaleTimeString()}
      </p>
    </Card>
  );
}
