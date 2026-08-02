import { forwardRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

/**
 * Button that owns its own pending/success state for a single async action.
 *
 * Guarantees for every mutating tap in the customer app:
 *  - a spinner + disabled button while the promise is in flight
 *  - no double submits (re-entrancy is blocked, not just visually disabled)
 *  - a brief success tick when the promise resolves
 *
 * It does NOT change what the action does — `onAction` is the existing handler.
 */
export const AsyncButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "onClick"> & {
    onAction: () => void | Promise<unknown>;
    pending?: boolean;
    loadingText?: string;
    successText?: string;
  }
>(function AsyncButton(
  { onAction, pending, loadingText, successText, children, className, disabled, ...rest },
  ref,
) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const isPending = busy || !!pending;

  const run = async () => {
    if (isPending) return; // hard re-entrancy guard — blocks rapid double taps
    setBusy(true);
    try {
      await onAction();
      setDone(true);
      window.setTimeout(() => setDone(false), 1400);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      ref={ref}
      {...rest}
      disabled={disabled || isPending}
      onClick={run}
      aria-busy={isPending}
      className={cn("transition-transform active:scale-[0.98]", className)}
    >
      {isPending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText ?? children}
        </>
      ) : done ? (
        <>
          <Check className="mr-2 h-4 w-4" />
          {successText ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
});
