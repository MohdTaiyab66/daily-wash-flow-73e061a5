import { cn } from "@/lib/utils";

/**
 * Shimmer primitives for the customer app.
 *
 * Rule: no screen may render a blank body while a query is pending — use one
 * of these instead. Purely presentational.
 */
export function Shimmer({ className }: { className?: string }) {
  return <div className={cn("uw-shimmer rounded-xl bg-muted", className)} />;
}

export function SkeletonLine({ className }: { className?: string }) {
  return <Shimmer className={cn("h-3 rounded-full", className)} />;
}

/** Generic list row skeleton: avatar + two lines + trailing chip. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3.5 rounded-3xl border border-border bg-card p-4", className)}>
      <Shimmer className="h-12 w-12 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonLine className="w-2/5" />
        <SkeletonLine className="w-3/5" />
      </div>
      <Shimmer className="h-6 w-14 rounded-full" />
    </div>
  );
}

export function SkeletonList({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

/** Big hero/vehicle/subscription card skeleton. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-3xl border border-border bg-card p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <SkeletonLine className="w-24" />
          <Shimmer className="h-6 w-2/3 rounded-lg" />
          <SkeletonLine className="w-1/2" />
        </div>
        <Shimmer className="h-16 w-24 rounded-2xl" />
      </div>
      <div className="mt-5 flex gap-3">
        <Shimmer className="h-8 w-24 rounded-full" />
        <Shimmer className="h-8 w-24 rounded-full" />
      </div>
    </div>
  );
}
