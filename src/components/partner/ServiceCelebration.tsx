import { useEffect } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

interface ServiceCelebrationProps {
  open: boolean;
  amount: number;
  completed: number;
  total: number;
  walletBalance?: number | null;
  nextCustomerName?: string | null;
  onDone: () => void;
  durationMs?: number;
}

/**
 * Fullscreen celebration overlay shown after a successful service completion.
 * Auto-dismisses after `durationMs` (default 1800ms) then calls onDone().
 */
export function ServiceCelebration({
  open,
  amount,
  completed,
  total,
  walletBalance,
  nextCustomerName,
  onDone,
  durationMs = 1800,
}: ServiceCelebrationProps) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onDone, durationMs);
    return () => window.clearTimeout(t);
  }, [open, durationMs, onDone]);

  if (!open) return null;

  const progressPct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const allDone = total > 0 && completed >= total;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Service completed"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      {/* Confetti-ish sparkles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="absolute block h-1.5 w-1.5 rounded-full bg-primary/80 animate-celebrate-particle"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              animationDelay: `${(i % 6) * 60}ms`,
            }}
          />
        ))}
      </div>

      <div className="relative mx-6 w-full max-w-sm rounded-3xl bg-background p-6 text-center shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500/20">
          <CheckCircle2 className="h-9 w-9 text-emerald-500 animate-in zoom-in-50 duration-500" />
        </div>

        <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Service complete
        </p>
        <p className="mt-1 flex items-center justify-center gap-1 text-4xl font-bold text-foreground">
          <Sparkles className="h-5 w-5 text-primary" />
          +₹{amount}
        </p>
        {walletBalance != null && (
          <p className="mt-1 text-xs text-muted-foreground">
            Wallet · ₹{Math.round(walletBalance)}
          </p>
        )}

        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>Today's Progress</span>
            <span>{completed} / {total}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          {allDone
            ? "You've finished today's route. Great work!"
            : nextCustomerName
              ? <>Next up: <span className="font-semibold text-foreground">{nextCustomerName}</span></>
              : "Moving to your next customer…"}
        </p>
      </div>
    </div>
  );
}
