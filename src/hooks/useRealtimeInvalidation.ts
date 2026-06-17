import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, tableKey, queryKey]);
}