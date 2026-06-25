import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function usePartner() {
  return useQuery({
    queryKey: ["me-partner"],
    queryFn: async () => {
      const { data: u, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!u.user) return null;
      const { data, error } = await supabase.from("partners").select("*").eq("id", u.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    // Don't flip the local online switch off just because the tab regained focus
    // and a refetch is in-flight. Availability is authoritative; we keep cached value.
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });
}

export function useIsOnline() {
  const { data } = usePartner();
  return data?.availability === "online";
}

export function useToggleOnline() {
  const qc = useQueryClient();
  return async (on: boolean) => {
    const { data: u, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!u.user) throw new Error("Please sign in again");
    const { error } = await supabase
      .from("partners")
      .update({ availability: on ? "online" : "offline", last_seen: new Date().toISOString() })
      .eq("id", u.user.id);
    if (error) throw error;
    // Optimistic local update; do NOT call invalidateQueries — a stale refetch
    // returning the previous value would visibly flip the switch back.
    qc.setQueryData(["me-partner"], (current: any) =>
      current ? { ...current, availability: on ? "online" : "offline" } : current,
    );
  };
}

/**
 * Partner heartbeat — pings `partners.last_seen` every 60s while the app is open.
 * This is informational only. It NEVER changes `availability`, so partners stay
 * online until they manually toggle off. Stops when the tab is hidden to save battery.
 */
export function usePartnerHeartbeat(partnerId: string | null | undefined) {
  useEffect(() => {
    if (!partnerId) return;
    let cancelled = false;
    const ping = async () => {
      if (cancelled || document.hidden) return;
      await supabase.from("partners").update({ last_seen: new Date().toISOString() }).eq("id", partnerId);
    };
    void ping();
    const id = window.setInterval(ping, 60_000);
    const onVis = () => { if (!document.hidden) void ping(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [partnerId]);
}
