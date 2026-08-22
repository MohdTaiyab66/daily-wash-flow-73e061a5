import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentGps } from "@/lib/native";

export function usePartner() {
  return useQuery({
    queryKey: ["me-partner"],
    queryFn: async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) return null;
      
      // Resolve canonical partner identity using phone/email link
      const { data, error } = await supabase
        .from("partners")
        .select("*")
        .or(`id.eq.${session.user.id},phone.eq.${session.user.phone?.replace('91', '') || 'NONE'},email.eq.${session.user.email}`)
        .maybeSingle();
        
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: false,
    staleTime: 5_000,
    refetchOnMount: "always",
  });
}

export function useIsOnline() {
  const { data } = usePartner();
  return data?.availability === "online";
}

export function useToggleOnline() {
  const qc = useQueryClient();
  return async (on: boolean) => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      // If we're toggling availability and have no session, we should probably force a reload or re-auth
      // rather than letting an unhandled rejection bubble up from getUser()
      window.location.href = '/auth';
      return;
    }
    
    // Resolve canonical partner identity for online toggle
    const { data: me } = await supabase
      .from("partners")
      .select("id")
      .or(`id.eq.${session.user.id},phone.eq.${session.user.phone?.replace('91', '') || 'NONE'},email.eq.${session.user.email}`)
      .maybeSingle();

    const partnerId = me?.id || session.user.id;

    const { error } = await supabase
      .from("partners")
      .update({ availability: on ? "online" : "offline", last_seen: new Date().toISOString() })
      .eq("id", partnerId);
    if (error) throw error;
    // Optimistic local update; do NOT call invalidateQueries — a stale refetch
    // returning the previous value would visibly flip the switch back.
    qc.setQueryData(["me-partner"], (current: any) =>
      current ? { ...current, availability: on ? "online" : "offline" } : current,
    );
    // Coming back online: reclaim any stops that Auto-Recovery released while
    // we were offline but no other partner picked up. Keeps today's route
    // counts on the Home dashboard in sync with the actual assignment.
    if (on) {
      try {
        const { reclaimReleasedRouteToday } = await import("@/lib/assignment.functions");
        const res = await reclaimReleasedRouteToday();
        if (res?.reclaimed) {
          qc.invalidateQueries({ queryKey: ["today-assignment"] });
          qc.invalidateQueries({ queryKey: ["today-assignment"] });
          qc.invalidateQueries({ queryKey: ["partner-services"] });
          qc.invalidateQueries({ queryKey: ["partner-route"] });
          qc.invalidateQueries({ queryKey: ["partner-today"] });
          qc.invalidateQueries({ queryKey: ["partner-live"] });
        }
      } catch {
        // Non-fatal: reclaim is best-effort.
      }
    }
  };
}


/**
 * Partner heartbeat — pings `partners.last_seen` (and current GPS when available)
 * every 45s while the app is open. Silent partners are auto-marked offline by the
 * `dar_check_offline_partners` cron sweep, which then hands their route to DAR.
 */
export function usePartnerHeartbeat(partnerId: string | null | undefined) {
  useEffect(() => {
    if (!partnerId) return;
    let cancelled = false;

    const ping = async () => {
      if (cancelled || (typeof document !== "undefined" && document.hidden)) return;
      const pos = await getCurrentGps({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30_000 });
      const patch = { last_seen: new Date().toISOString() } as {
        last_seen: string;
        current_lat?: number;
        current_lng?: number;
      };
      if (pos) {
        patch.current_lat = pos.lat;
        patch.current_lng = pos.lng;
      }
      await supabase.from("partners").update(patch).eq("id", partnerId);
    };
    void ping();
    const id = window.setInterval(ping, 45_000);
    const onVis = () => { if (!document.hidden) void ping(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [partnerId]);
}
