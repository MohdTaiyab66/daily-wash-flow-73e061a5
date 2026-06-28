import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AreaAvailability = {
  area_id: string | null;
  area_name: string | null;
  matched: boolean;
  is_active: boolean;
  daily_shine: boolean;
  premium: boolean;
  washing: boolean;
  interior: boolean;
  exterior: boolean;
  deep_clean: boolean;
  polish: boolean;
  cutter_polish: boolean;
  seat_cleaning: boolean;
  roof_cleaning: boolean;
  distance_km: number | null;
};

const NONE: AreaAvailability = {
  area_id: null, area_name: null, matched: false, is_active: false,
  daily_shine: false, premium: false,
  washing: false, interior: false, exterior: false, deep_clean: false,
  polish: false, cutter_polish: false, seat_cleaning: false, roof_cleaning: false,
  distance_km: null,
};

export function readCustomerGeo(): { lat: number | null; lng: number | null; pincode: string | null } {
  if (typeof window === "undefined") return { lat: null, lng: null, pincode: null };
  try {
    const raw = localStorage.getItem("uw_customer_geo");
    if (!raw) return { lat: null, lng: null, pincode: null };
    const j = JSON.parse(raw);
    return { lat: j.lat ?? null, lng: j.lng ?? null, pincode: j.pincode ?? null };
  } catch { return { lat: null, lng: null, pincode: null }; }
}

export async function fetchAreaAvailability(args: { lat?: number | null; lng?: number | null; pincode?: string | null }): Promise<AreaAvailability> {
  const { data, error } = await (supabase as any).rpc("get_area_availability", {
    p_lat: args.lat ?? null,
    p_lng: args.lng ?? null,
    p_pincode: args.pincode ?? null,
  });
  if (error) return NONE;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as AreaAvailability) ?? NONE;
}

export function useAreaAvailability() {
  // Re-read geo on mount and when localStorage changes (cross-tab).
  const [geo, setGeo] = useState(readCustomerGeo());
  useEffect(() => {
    setGeo(readCustomerGeo());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "uw_customer_geo") setGeo(readCustomerGeo());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const q = useQuery({
    queryKey: ["area-availability", geo.lat, geo.lng, geo.pincode],
    queryFn: () => fetchAreaAvailability(geo),
    staleTime: 60_000,
  });

  return { data: q.data ?? NONE, isLoading: q.isLoading, geo, refetch: q.refetch };
}

/** Map a service catalog slug to the per-service availability flag. */
export function isServiceAllowed(slug: string, a: AreaAvailability): boolean {
  if (!a.matched || !a.is_active) return false;
  if (slug.startsWith("daily-shine")) return a.daily_shine;
  // Everything else is "Premium"
  if (!a.premium) return false;
  if (slug === "one-time-wash" || slug === "one-time-wash-no-polish") return a.washing;
  if (slug === "deep-clean" || slug === "deep-clean-interior") return a.deep_clean;
  if (slug === "body-polish" || slug === "buffing-polish") return a.polish;
  if (slug === "cutter-polish") return a.cutter_polish;
  if (slug === "seat-cleaning") return a.seat_cleaning;
  if (slug === "roof-cleaning") return a.roof_cleaning;
  if (slug === "dusting") return a.interior || a.exterior;
  return a.premium;
}
