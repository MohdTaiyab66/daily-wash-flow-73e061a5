import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePartner() {
  return useQuery({
    queryKey: ["me-partner"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("partners").select("*").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });
}

export function useIsOnline() {
  const { data } = usePartner();
  return data?.availability === "online";
}

export function useToggleOnline() {
  const qc = useQueryClient();
  return async (on: boolean) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("partners").update({ availability: on ? "online" : "offline" }).eq("id", u.user.id);
    qc.invalidateQueries({ queryKey: ["me-partner"] });
  };
}
