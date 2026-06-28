// Coverage Zone Availability (GIS).
// Reads the customer's stored GPS and resolves availability via `get_coverage_at`.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AreaAvailability = {
  matched: boolean;
  is_active: boolean;
  zone_id: string | null;
  zone_name: string | null;
  // service flags
  daily_shine: boolean;
  premium: boolean;
  washing: boolean;
  interior: boolean;
  exterior: boolean;
  int_ext: boolean;
  deep_clean: boolean;
  polish: boolean;
  cutter_polish: boolean;
  roof_cleaning: boolean;
  seat_cleaning: boolean;
  corporate_fleet: boolean;
  emergency: boolean;
  // legacy fields kept for backward compat with existing UI consumers
  area_id: string | null;
  area_name: string | null;
  distance_km: number | null;
};

const NONE: AreaAvailability = {
  matched: false, is_active: false, zone_id: null, zone_name: null,
  daily_shine: false, premium: false, washing: false, interior: false, exterior: false,
  int_ext: false, deep_clean: false, polish: false, cutter_polish: false,
  roof_cleaning: false, seat_cleaning: false, corporate_fleet: false, emergency: false,
  area_id: null, area_name: null, distance_km: null,
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
  if (args.lat == null || args.lng == null) return NONE;
  const { data, error } = await (supabase as any).rpc("get_coverage_at", {
    p_lat: args.lat,
    p_lng: args.lng,
  });
  if (error) return NONE;
  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row || !row.matched) return NONE;
  return {
    matched: !!row.matched,
    is_active: row.status === "active",
    zone_id: row.zone_id ?? null,
    zone_name: row.zone_name ?? null,
    daily_shine: !!row.daily_shine,
    premium: !!row.premium,
    washing: !!row.washing,
    interior: !!row.interior,
    exterior: !!row.exterior,
    int_ext: !!row.int_ext,
    deep_clean: !!row.deep_clean,
    polish: !!row.polish,
    cutter_polish: !!row.cutter_polish,
    roof_cleaning: !!row.roof_cleaning,
    seat_cleaning: !!row.seat_cleaning,
    corporate_fleet: !!row.corporate_fleet,
    emergency: !!row.emergency,
    area_id: row.zone_id ?? null,
    area_name: row.zone_name ?? null,
    distance_km: 0,
  };
}

export function useAreaAvailability() {
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
    queryKey: ["coverage-at", geo.lat, geo.lng],
    queryFn: () => fetchAreaAvailability(geo),
    staleTime: 60_000,
  });

  return { data: q.data ?? NONE, isLoading: q.isLoading, geo, refetch: q.refetch };
}

/** Map a service catalog slug to the per-service availability flag. */
export function isServiceAllowed(slug: string, a: AreaAvailability): boolean {
  if (!a || !a.matched) return false;
  if (slug.startsWith("daily-shine")) return a.daily_shine;
  if (!a.premium) return false;
  if (slug === "one-time-wash" || slug === "one-time-wash-no-polish") return a.washing;
  if (slug === "deep-clean" || slug === "deep-clean-interior") return a.deep_clean;
  if (slug === "body-polish" || slug === "buffing-polish") return a.polish;
  if (slug === "cutter-polish") return a.cutter_polish;
  if (slug === "seat-cleaning") return a.seat_cleaning;
  if (slug === "roof-cleaning") return a.roof_cleaning;
  if (slug === "dusting") return a.interior || a.exterior;
  if (slug === "int-ext-wash") return a.int_ext;
  if (slug === "corporate-fleet") return a.corporate_fleet;
  if (slug === "emergency") return a.emergency;
  return a.premium;
}
