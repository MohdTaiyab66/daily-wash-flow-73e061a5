import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Touch pull-to-refresh wrapper (Home / Bookings / Profile).
 *
 * Only engages when the scroll container is already at the top, so it never
 * fights normal scrolling. `onRefresh` typically invalidates queries — this
 * component does not know or care what is refetched.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => void | Promise<unknown>;
  children: ReactNode;
  className?: string;
}) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const THRESHOLD = 70;

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (e: TouchEvent) => {
      if (refreshing || !atTop()) return;
      startY.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || !atTop()) {
        setPull(0);
        return;
      }
      // Rubber-band: the further you pull, the less it moves.
      setPull(Math.min(96, delta * 0.45));
    };
    const onEnd = async () => {
      if (startY.current === null) return;
      const reached = pull >= THRESHOLD * 0.6;
      startY.current = null;
      if (!reached) {
        setPull(0);
        return;
      }
      setRefreshing(true);
      setPull(THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pull, refreshing, onRefresh]);

  const active = pull > 0 || refreshing;

  return (
    <div className={cn("relative", className)}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: pull }}
        aria-hidden={!active}
      >
        <span className="mt-2 grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-primary shadow-sm">
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowDown
              className="h-4 w-4 transition-transform duration-150"
              style={{ transform: `rotate(${pull >= 42 ? 180 : 0}deg)` }}
            />
          )}
        </span>
      </div>
      <div
        style={{ transform: `translateY(${pull}px)` }}
        className={cn(pull === 0 && "transition-transform duration-200")}
      >
        {children}
      </div>
    </div>
  );
}
