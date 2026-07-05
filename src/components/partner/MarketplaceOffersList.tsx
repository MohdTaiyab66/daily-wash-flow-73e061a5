import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getPartnerOpenOffers } from "@/lib/marketplace.functions";
import { MarketplaceOfferCard } from "./MarketplaceOfferCard";
import { MarketplaceOfferSheet } from "./MarketplaceOfferSheet";

/**
 * Renders marketplace offers for the current partner.
 *
 * Behaviour:
 *  - The freshest, highest-priority offer opens as a foreground bottom sheet
 *    (in-app equivalent of the Uber ride-request popup).
 *  - Additional stacked offers appear as compact cards inline below.
 *  - Sound + vibration for a *new* offer id are played once (browser is a
 *    fallback for FCM foreground — native handles background/lock-screen).
 */
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
        () => qc.invalidateQueries({ queryKey: ["marketplace-offers"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "marketplace_broadcasts" },
        () => qc.invalidateQueries({ queryKey: ["marketplace-offers"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const offers = useMemo(() => {
    const list = ((q.data ?? []) as any[]).slice();
    // Highest-value offer wins the full-screen slot; break ties by newest.
    list.sort((a, b) => {
      const di = Number(b.incentive) - Number(a.incentive);
      if (di !== 0) return di;
      return new Date(b.sent_at ?? 0).getTime() - new Date(a.sent_at ?? 0).getTime();
    });
    return list;
  }, [q.data]);
  const top = offers[0] ?? null;
  const rest = offers.slice(1);
  const count = offers.length;

  // Play a short chirp + vibrate once per new top offer id.
  const seenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!top) return;
    if (seenIdRef.current === top.id) return;
    seenIdRef.current = top.id;
    try {
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        [880, 1320].forEach((freq, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = "sine";
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
          g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.25 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.22);
          o.connect(g).connect(ctx.destination);
          o.start(ctx.currentTime + i * 0.25);
          o.stop(ctx.currentTime + i * 0.25 + 0.25);
        });
      }
    } catch { /* audio may be blocked before user interaction */ }
    try { navigator.vibrate?.([300, 150, 300, 150, 500]); } catch { /* noop */ }
  }, [top?.id]);

  const closeTop = useMemo(
    () => () => qc.invalidateQueries({ queryKey: ["marketplace-offers"] }),
    [qc],
  );

  if (count === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Marketplace</h3>
        <span className="inline-flex min-w-[24px] items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground animate-pulse">
          {count}
        </span>
      </div>
      {top && <MarketplaceOfferSheet offer={top} onClose={closeTop} />}
      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((o) => (
            <MarketplaceOfferCard key={o.id} offer={o} compact />
          ))}
        </div>
      )}
    </div>
  );
}
