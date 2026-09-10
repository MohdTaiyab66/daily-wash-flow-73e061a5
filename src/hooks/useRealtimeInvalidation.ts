import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/platform";

/**
 * Generic realtime invalidation hook.
 */
export function useRealtimeInvalidation(tables: string[], queryKeys?: Array<readonly unknown[]>) {
  const queryClient = useQueryClient();
  const tableKey = tables.join(",");
  const queryKeyStr = JSON.stringify(queryKeys ?? []);

  useEffect(() => {
    if (tables.length === 0) return;
    
    // Set up realtime channel for tables
    
    const channel = supabase.channel(`realtime-inv-${Math.random().toString(36).slice(2, 8)}`);

    // Coalesce bursts of database events into a single refresh so screens
    // don't thrash (and visibly flicker) several times per second.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRun = 0;
    const MIN_GAP_MS = 3000;

    const runRefresh = () => {
      lastRun = Date.now();
      if (queryKeys?.length) {
        queryKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key as any, refetchType: "active" });
        });
      } else {
        queryClient.invalidateQueries({ refetchType: "active" });
      }
    };

    const refresh = (_source: string) => {
      if (timer) return;
      const wait = Math.max(300, MIN_GAP_MS - (Date.now() - lastRun));
      timer = setTimeout(() => {
        timer = null;
        runRefresh();
      }, wait);
    };

    tables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        // Handle change event
        refresh(`DB_${table}_${payload.eventType}`);
      });
    });

    channel.subscribe((status) => {
      // Handle status change
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Initial refresh to ensure sync
        refresh(`CHANNEL_${status}`);
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        refresh("VISIBILITY_CHANGE");
      }
    };
    
    const onOnline = () => {
      refresh("NETWORK_ONLINE");
    };
    
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    let nativeListener: { remove: () => Promise<void> } | null = null;
    if (isNative()) {
      void import("@capacitor/app")
        .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            refresh("NATIVE_APP_ACTIVE");
          }
        }))
        .then((listener) => { nativeListener = listener; })
        .catch(() => null);
    }

    return () => {
      // Clean up listener
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void nativeListener?.remove();
      supabase.removeChannel(channel);
    };
  }, [queryClient, tableKey, queryKeyStr]);
}
