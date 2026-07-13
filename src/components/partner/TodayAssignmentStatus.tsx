import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TodayAssignmentMetrics } from "@/hooks/use-today-assignment";

function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function MetricsLine({ metrics, lastSuccessAt }: { metrics?: TodayAssignmentMetrics; lastSuccessAt?: number | null }) {
  if (!metrics) return null;
  const pct = Math.round(metrics.successRate * 100);
  return (
    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/80">
      Last update {timeAgo(lastSuccessAt ?? metrics.lastSuccessAt)} · retries {metrics.retryAttempts} · {pct}% success
      {metrics.failures > 0 ? ` · ${metrics.failures} failed` : ""}
    </p>
  );
}

/**
 * Non-blocking status banner shown at the top of partner screens when the
 * unified `today-assignment` query is retrying or has failed. Never lets
 * the user see silent "0 customers" while the API is retrying.
 */
export function TodayAssignmentStatus({
  isError,
  isFetching,
  isRefetching,
  hasData,
  onRetry,
  metrics,
  lastSuccessAt,
}: {
  isError: boolean;
  isFetching: boolean;
  isRefetching: boolean;
  hasData: boolean;
  onRetry: () => void;
  metrics?: TodayAssignmentMetrics;
  lastSuccessAt?: number | null;
}) {
  if (isError) {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Can't load today's route</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hasData
              ? `Showing your last known route from ${timeAgo(lastSuccessAt ?? metrics?.lastSuccessAt ?? null)}. We'll keep retrying.`
              : "Check your connection and try again."}
          </p>
          <MetricsLine metrics={metrics} lastSuccessAt={lastSuccessAt} />
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
      <div className="mt-3 rounded-2xl border border-border bg-muted/40 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Refreshing today's route… showing last update from {timeAgo(lastSuccessAt ?? metrics?.lastSuccessAt ?? null)}
        </div>
        <MetricsLine metrics={metrics} lastSuccessAt={lastSuccessAt} />
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
 * Blocking skeleton used while today-assignment is loading for the very
 * first time (no last-good cache). Never renders "0 customers".
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
