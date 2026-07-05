import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getPartnerOpenOffers } from "@/lib/marketplace.functions";
import { MarketplaceOfferCard } from "./MarketplaceOfferCard";

export function MarketplaceOffersList() {
  const qc = useQueryClient();
  const fetchOffers = useServerFn(getPartnerOpenOffers);
  const q = useQuery({
    queryKey: ["marketplace-offers"],
    queryFn: () => fetchOffers(),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("marketplace-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketplace_offers" },
        () => qc.invalidateQueries({ queryKey: ["marketplace-offers"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketplace_broadcasts" },
        () => qc.invalidateQueries({ queryKey: ["marketplace-offers"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const offers = (q.data ?? []) as any[];
  if (offers.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Marketplace offers</h3>
      {offers.map((o) => (
        <MarketplaceOfferCard key={o.id} offer={o} />
      ))}
    </div>
  );
}
