import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { MarketplaceOfferCard } from "./MarketplaceOfferCard";

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
  const roundExpiresAt = offer?.broadcast?.round_expires_at;
  const remaining = roundExpiresAt
    ? Math.max(0, Math.round((new Date(roundExpiresAt).getTime() - Date.now()) / 1000))
    : 0;

  // Auto-close when the timer ends — the parent list refetches from realtime
  // and simply stops passing the offer if it's been superseded/accepted.
  if (remaining === 0) {
    // Defer to next tick so React doesn't warn about updating during render.
    queueMicrotask(onClose);
  }

  return (
    <Sheet open={!!offer} onOpenChange={(v) => { if (!v) onClose(); }}>
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
