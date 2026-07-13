import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Non-blocking status banner shown at the top of partner screens when the
 * unified `today-assignment` query is retrying or has failed. Its job is to
 * make sure the partner never sees a silent "0 customers" state while the
 * API is retrying or the network is briefly down.
 */
export function TodayAssignmentStatus({
  isError,
  isFetching,
  isRefetching,
  hasData,
  onRetry,
}: {
  isError: boolean;
  isFetching: boolean;
  isRefetching: boolean;
  hasData: boolean;
  onRetry: () => void;
}) {
  if (isError) {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Can't load today's route</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hasData
              ? "Showing your last known route. We'll keep retrying automatically."
              : "Check your connection and try again."}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onRetry} className="h-8 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }
  if (isRefetching && hasData) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Refreshing today's route…
      </div>
    );
  }
  if (isFetching && !hasData) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading today's route…
      </div>
    );
  }
  return null;
}

/**
 * Full-screen blocking skeleton used while today-assignment is loading for
 * the first time. Never renders "0 customers" — better a shimmer than a lie.
 */
export function TodayAssignmentSkeleton() {
  return (
    <div className="mx-auto max-w-md px-5 pb-6 pt-3">
      <div className="h-4 w-32 animate-pulse rounded-full bg-muted" />
      <div className="mt-2 h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="mt-4 h-14 animate-pulse rounded-2xl bg-muted" />
      <div className="mt-5 h-56 animate-pulse rounded-3xl bg-muted" />
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="h-20 animate-pulse rounded-2xl bg-muted" />
        <div className="h-20 animate-pulse rounded-2xl bg-muted" />
        <div className="h-20 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
