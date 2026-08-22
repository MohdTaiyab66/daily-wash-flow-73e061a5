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
    
    const refresh = (source: string) => {
      // Invalidation triggered
      if (queryKeys?.length) {
        queryKeys.forEach((key) => {
          // Invalidating key
          queryClient.invalidateQueries({ queryKey: key as any });
        });
      } else {
        // Invalidating all queries
        queryClient.invalidateQueries();
      }
    };

    tables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        console.log(`[PARTNER-REALTIME] [EVENT] Change in ${table}: ${payload.eventType}`, payload);
        refresh(`DB_${table}_${payload.eventType}`);
      });
    });

    channel.subscribe((status) => {
      console.log(`[PARTNER-REALTIME] [STATUS] Channel status for [${tableKey}]: ${status}`);
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        // Initial refresh to ensure sync
        refresh(`CHANNEL_${status}`);
      }
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        console.log(`[PARTNER-REALTIME] [WINDOW] Visibility change, refreshing`);
        refresh("VISIBILITY_CHANGE");
      }
    };
    
    const onOnline = () => {
      console.log(`[PARTNER-REALTIME] [NETWORK] Back online, refreshing`);
      refresh("NETWORK_ONLINE");
    };
    
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    let nativeListener: { remove: () => Promise<void> } | null = null;
    if (isNative()) {
      void import("@capacitor/app")
        .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            console.log(`[PARTNER-REALTIME] [NATIVE] App became active, refreshing`);
            refresh("NATIVE_APP_ACTIVE");
          }
        }))
        .then((listener) => { nativeListener = listener; })
        .catch(() => null);
    }

    return () => {
      console.log(`[PARTNER-REALTIME] [useRealtimeInvalidation] Unmounting listener for: ${tableKey}`);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void nativeListener?.remove();
      supabase.removeChannel(channel);
    };
  }, [queryClient, tableKey, queryKeyStr]);
}
