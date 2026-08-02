import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Booking journey progress rail: Vehicle → Date → Time → Payment → Confirm.
 *
 * Display only — it reads the current step from the caller and never changes
 * the booking flow's order or logic.
 */
export function StepIndicator({
  steps,
  current,
  className,
}: {
  steps: string[];
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-center gap-1", className)} aria-label="Booking progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-0.5 flex-1 rounded-full transition-colors",
                  i === 0 ? "bg-transparent" : done || active ? "bg-primary" : "bg-border",
                )}
              />
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold transition-all",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                    ? "border-primary bg-primary/10 text-primary scale-110"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1 rounded-full transition-colors",
                  i === steps.length - 1 ? "bg-transparent" : done ? "bg-primary" : "bg-border",
                )}
              />
            </div>
            <span
              className={cn(
                "truncate text-[10px] font-medium",
                active ? "text-primary" : done ? "text-foreground/70" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
