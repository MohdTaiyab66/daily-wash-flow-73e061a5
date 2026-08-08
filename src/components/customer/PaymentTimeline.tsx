import { AlertTriangle, Check, CircleDashed, Clock, Loader2, WifiOff, X } from "lucide-react";
import type { CheckoutEvent, CheckoutStage } from "@/lib/pending-checkout-store";
import { cn } from "@/lib/utils";

/**
 * Payment status timeline shown on the checkout screen.
 *
 * Purely presentational — it renders the persisted checkout events so the
 * customer can see exactly what happened (order created, Razorpay opened,
 * failed/timed out, verified paid/unpaid) especially after a crash, an
 * offline drop, or a resume.
 */

const LABELS: Record<CheckoutStage, string> = {
  created: "Order created",
  opened: "Razorpay opened",
  failed: "Payment failed",
  timeout: "Timed out",
  cancelled: "Cancelled",
  offline: "Network lost",
  verifying: "Verifying with Razorpay",
  paid: "Verified · Paid",
  unpaid: "Verified · Unpaid",
};

function StageIcon({ stage }: { stage: CheckoutStage }) {
  switch (stage) {
    case "paid":
      return <Check className="h-3 w-3" />;
    case "failed":
      return <AlertTriangle className="h-3 w-3" />;
    case "cancelled":
    case "unpaid":
      return <X className="h-3 w-3" />;
    case "timeout":
      return <Clock className="h-3 w-3" />;
    case "offline":
      return <WifiOff className="h-3 w-3" />;
    case "verifying":
      return <Loader2 className="h-3 w-3 animate-spin" />;
    default:
      return <CircleDashed className="h-3 w-3" />;
  }
}

function toneFor(stage: CheckoutStage) {
  if (stage === "paid") return "text-success border-success/40 bg-success/10";
  if (stage === "failed" || stage === "unpaid" || stage === "cancelled")
    return "text-destructive border-destructive/40 bg-destructive/10";
  if (stage === "timeout" || stage === "offline")
    return "text-warning-foreground border-warning/50 bg-warning/15";
  return "text-muted-foreground border-border bg-muted/40";
}

export function PaymentTimeline({
  events,
  className,
}: {
  events: CheckoutEvent[];
  className?: string;
}) {
  if (!events.length) return null;
  return (
    <div
      data-testid="payment-timeline"
      className={cn("mb-2 rounded-lg border border-border bg-card/60 px-3 py-2", className)}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Payment activity
      </p>
      <ol className="mt-1.5 space-y-1.5">
        {events.map((e, i) => (
          <li key={`${e.stage}-${e.at}-${i}`} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                toneFor(e.stage),
              )}
            >
              <StageIcon stage={e.stage} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium">{LABELS[e.stage] ?? e.stage}</span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {e.detail ? (
                <p className="truncate text-[10px] text-muted-foreground">{e.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
