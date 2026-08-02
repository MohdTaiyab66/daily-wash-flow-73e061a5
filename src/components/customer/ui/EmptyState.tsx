import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared customer-app empty state.
 *
 * Presentation only — it never fetches or mutates. Every "nothing here yet"
 * surface (vehicles, bookings, subscription, notifications) renders through
 * this so the illustration, copy rhythm and CTA placement stay identical.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = "default",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  tone?: "default" | "primary";
}) {
  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center rounded-3xl border border-dashed border-border bg-card/40 px-6 py-12 text-center",
        className,
      )}
    >
      <span
        className={cn(
          "relative grid h-20 w-20 place-items-center rounded-3xl",
          tone === "primary" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <span className="absolute inset-0 rounded-3xl bg-current opacity-[0.06]" aria-hidden />
        <Icon className="h-9 w-9" strokeWidth={1.6} />
      </span>
      <h3 className="mt-5 text-base font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
