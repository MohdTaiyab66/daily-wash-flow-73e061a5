import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getPartnerOpenOffers } from "@/lib/marketplace.functions";
import { logMarketplaceEvent } from "@/lib/marketplace-tracking";
import { MarketplaceOfferCard } from "./MarketplaceOfferCard";
import { MarketplaceOfferSheet } from "./MarketplaceOfferSheet";

/** How long (ms) to suppress the auto-popup after a decline, unless a better
 * offer arrives (higher incentive or a different broadcast). */
const DECLINE_COOLDOWN_MS = 45_000;

/**
 * Renders marketplace offers for the current partner.
 *
 * Batch B additions:
 *  - Polls every 15s as an FCM fallback so a dropped push doesn't cost a lead.
 *  - Logs push_delivered / popup_displayed / accepted / declined / expired
 *    into `marketplace_delivery_events` for admin analytics.
 *  - Applies a 45s cooldown after Decline so partners aren't spammed with the
 *    same-or-worse offer, while still surfacing genuinely better ones.
 */
export function MarketplaceOffersList() {
  const qc = useQueryClient();
  const fetchOffers = useServerFn(getPartnerOpenOffers);
  const q = useQuery({
    queryKey: ["marketplace-offers"],
    queryFn: () => fetchOffers(),
    // Fallback polling — keeps working when FCM misses / OEM blocks / offline.
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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
    list.sort((a, b) => {
      const di = Number(b.incentive) - Number(a.incentive);
      if (di !== 0) return di;
      return new Date(b.sent_at ?? 0).getTime() - new Date(a.sent_at ?? 0).getTime();
    });
    return list;
  }, [q.data]);

  // Post-decline cooldown state.
  const cooldownRef = useRef<{ untilMs: number; broadcastId: string | null; incentive: number } | null>(null);
  const [, forceRerender] = useState(0);
  useEffect(() => {
    // Kick a re-render when cooldown expires so the sheet reappears if needed.
    if (!cooldownRef.current) return;
    const left = cooldownRef.current.untilMs - Date.now();
    if (left <= 0) return;
    const t = window.setTimeout(() => forceRerender((n) => n + 1), left + 50);
    return () => window.clearTimeout(t);
  }, [offers.length]);

  const now = Date.now();
  const cd = cooldownRef.current;
  const cooldownActive =
    !!cd &&
    cd.untilMs > now;

  const top = offers[0] ?? null;

  // Suppress the top sheet during cooldown UNLESS the new top offer is
  // "genuinely better" (different broadcast OR higher incentive).
  const suppressTop =
    !!top &&
    cooldownActive &&
    cd!.broadcastId === top.broadcast_id &&
    Number(top.incentive) <= cd!.incentive;

  const restStart = suppressTop ? 0 : 1;
  const rest = offers.slice(restStart);
  const count = offers.length;

  // Log popup_displayed / push_delivered exactly once per offer id.
  const seenIdRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const o of offers) {
      if (seenIdRef.current.has(o.id)) continue;
      seenIdRef.current.add(o.id);
      void logMarketplaceEvent({
        offerId: o.id,
        broadcastId: o.broadcast_id,
        stage: "push_delivered",
        meta: { source: "web", round: o.round, incentive: o.incentive },
      });
    }
  }, [offers]);

  // Chirp + vibrate + log popup_displayed once per new top offer id (only when
  // we're actually going to show it — respects cooldown).
  const chirpedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!top || suppressTop) return;
    if (chirpedIdRef.current === top.id) return;
    chirpedIdRef.current = top.id;
    void logMarketplaceEvent({
      offerId: top.id,
      broadcastId: top.broadcast_id,
      stage: "popup_displayed",
    });
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
    } catch {
      /* audio may be blocked before user interaction */
    }
    try {
      navigator.vibrate?.([300, 150, 300, 150, 500]);
    } catch {
      /* noop */
    }
  }, [top?.id, suppressTop]);

  const handleDecline = useMemo(
    () => (offer: any) => {
      cooldownRef.current = {
        untilMs: Date.now() + DECLINE_COOLDOWN_MS,
        broadcastId: offer?.broadcast_id ?? null,
        incentive: Number(offer?.incentive ?? 0),
      };
      qc.invalidateQueries({ queryKey: ["marketplace-offers"] });
    },
    [qc],
  );

  const handleAccept = useMemo(
    () => (_offer: any) => {
      // Play a short success chime after acceptance.
      try {
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as
          | typeof AudioContext
          | undefined;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          [660, 880, 1320].forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = "sine";
            o.frequency.value = freq;
            const t0 = ctx.currentTime + i * 0.12;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
            o.connect(g).connect(ctx.destination);
            o.start(t0);
            o.stop(t0 + 0.2);
          });
        }
      } catch { /* noop */ }
      try { navigator.vibrate?.([80, 40, 80]); } catch { /* noop */ }
      cooldownRef.current = null;
    },
    [],
  );

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
      {top && !suppressTop && (
        <MarketplaceOfferSheet
          offer={top}
          onClose={closeTop}
          onAccept={() => handleAccept(top)}
          onDecline={() => handleDecline(top)}
        />
      )}
      {rest.length > 0 && (
        <div className="space-y-2">
          {rest.map((o) => (
            <MarketplaceOfferCard
              key={o.id}
              offer={o}
              compact
              onAccept={() => handleAccept(o)}
              onDecline={() => handleDecline(o)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
