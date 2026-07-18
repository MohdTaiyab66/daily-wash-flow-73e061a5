import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useEffect, useRef } from "react";
import { MarketplaceOfferCard } from "./MarketplaceOfferCard";
import { popupDebug, remainingSecondsFrom, traceComponentMount, traceComponentUnmount, tracePopupOpen } from "@/lib/offer-popup-debug";

/**
 * Foreground bottom-sheet variant of the marketplace offer.
 *
 * When the partner is in the app, we don't want to disturb them with a
 * lock-screen-style notification — instead, this slides up from the bottom
 * over whatever screen they're on. The sheet is non-dismissable: Accept or
 * Decline must be chosen (or the countdown runs out and it closes itself).
 */
export function MarketplaceOfferSheet({
  offer,
  onClose,
  onAccept,
  onDecline,
}: {
  offer: any;
  onClose: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const loggedOpenOfferRef = useRef<string | null>(null);
  const roundExpiresAt = offer?.broadcast?.round_expires_at;
  const remaining = roundExpiresAt
    ? Math.max(0, Math.round((new Date(roundExpiresAt).getTime() - Date.now()) / 1000))
    : 0;

  useEffect(() => {
    traceComponentMount("MarketplaceOfferSheet", {
      offer_id: offer?.id ?? null,
      partner_id: offer?.partner_id ?? null,
      booking_id: offer?.broadcast?.booking_id ?? null,
      status: offer?.response ?? null,
      route: "/app",
    });
    popupDebug("MarketplaceOfferSheet mounted", {
      component: "MarketplaceOfferSheet",
      offer_id: offer?.id ?? null,
      partner_id: offer?.partner_id ?? null,
      booking_id: offer?.broadcast?.booking_id ?? null,
    });
    return () => {
      traceComponentUnmount("MarketplaceOfferSheet", {
        offer_id: offer?.id ?? null,
        partner_id: offer?.partner_id ?? null,
        booking_id: offer?.broadcast?.booking_id ?? null,
        status: offer?.response ?? null,
        route: "/app",
      });
      popupDebug("MarketplaceOfferSheet unmounted", {
        component: "MarketplaceOfferSheet",
        offer_id: offer?.id ?? null,
        partner_id: offer?.partner_id ?? null,
        booking_id: offer?.broadcast?.booking_id ?? null,
      });
    };
  }, [offer?.id, offer?.partner_id, offer?.broadcast?.booking_id]);

  if (offer?.id && loggedOpenOfferRef.current !== offer.id) {
    loggedOpenOfferRef.current = offer.id;
    tracePopupOpen({
      component: "MarketplaceOfferSheet",
      function: "render open Sheet",
      reason: "parent rendered MarketplaceOfferSheet with offer",
      opened_by: "MarketplaceOffersList top && !suppressTop",
      offer_id: offer.id,
      partner_id: offer.partner_id ?? null,
      booking_id: offer.broadcast?.booking_id ?? null,
      status: offer.response ?? null,
      remaining_seconds: remainingSecondsFrom(roundExpiresAt),
      server_now: null,
      client_now: new Date().toISOString(),
      expires_at: roundExpiresAt ?? null,
    });
  }

  // Auto-close when the timer ends — the parent list refetches from realtime
  // and simply stops passing the offer if it's been superseded/accepted.
  if (remaining === 0) {
    popupDebug("Popup close", {
      component: "MarketplaceOfferSheet",
      function: "render timer expiry branch",
      reason: "remaining === 0",
      offer_id: offer?.id ?? null,
      partner_id: offer?.partner_id ?? null,
      booking_id: offer?.broadcast?.booking_id ?? null,
      status: offer?.response ?? null,
      remaining_seconds: remaining,
      server_now: null,
      client_now: new Date().toISOString(),
      expires_at: roundExpiresAt ?? null,
    });
    // Defer to next tick so React doesn't warn about updating during render.
    queueMicrotask(onClose);
  }

  return (
    <Sheet open={!!offer} onOpenChange={(v) => {
      popupDebug("Popup open state changed", {
        component: "MarketplaceOfferSheet",
        function: "Sheet.onOpenChange",
        reason: v ? "sheet requested open" : "sheet requested close",
        open: v,
        offer_id: offer?.id ?? null,
        partner_id: offer?.partner_id ?? null,
        booking_id: offer?.broadcast?.booking_id ?? null,
      });
      if (!v) onClose();
    }}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-2xl border-t bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <VisuallyHidden>
          <SheetTitle>New Daily Shine Customer</SheetTitle>
          <SheetDescription>
            A new marketplace offer has arrived. Accept or decline before the
            countdown ends.
          </SheetDescription>
        </VisuallyHidden>
        <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="mt-3">
          <MarketplaceOfferCard offer={offer} onAccept={onAccept} onDecline={onDecline} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
