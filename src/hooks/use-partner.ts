import { useQuery, useQueryClient } from "@tanstack/react-query";
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
    const { error } = await supabase.from("partners").update({ availability: on ? "online" : "offline" }).eq("id", u.user.id);
    if (error) throw error;
    qc.setQueryData(["me-partner"], (current: any) => current ? { ...current, availability: on ? "online" : "offline" } : current);
    qc.invalidateQueries({ queryKey: ["me-partner"] });
  };
}
