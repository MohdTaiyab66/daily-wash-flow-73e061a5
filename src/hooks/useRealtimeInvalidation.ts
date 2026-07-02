import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/platform";

export function useRealtimeInvalidation(tables: string[], queryKeys?: Array<readonly unknown[]>) {
  const queryClient = useQueryClient();
  const tableKey = tables.join(",");
  const queryKey = JSON.stringify(queryKeys ?? []);

  useEffect(() => {
    if (tables.length === 0) return;
    const channel = supabase.channel(`trial-live-${tableKey}-${queryKey}`);
    const refresh = () => {
      if (queryKeys?.length) queryKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key as any }));
      else queryClient.invalidateQueries();
    };
    tables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") refresh();
    });

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onOnline = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    let nativeListener: { remove: () => Promise<void> } | null = null;
    if (isNative()) {
      void import("@capacitor/app")
        .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => { if (isActive) refresh(); }))
        .then((listener) => { nativeListener = listener; })
        .catch(() => null);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void nativeListener?.remove();
      supabase.removeChannel(channel);
    };
  }, [queryClient, tableKey, queryKey]);
}