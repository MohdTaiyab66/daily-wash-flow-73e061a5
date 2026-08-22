import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTodayIST } from "@/lib/date-utils";

/**
 * Shape of the unified "today assignment" payload consumed by
 * Home, Live Route and My Assignment. Single source of truth so
 * partner screens never drift.
 */
export type TodayAssignmentData = {
  assignment: any | null;
  all: any[];
  today: any[];
  nextDate: string | null;
  todaysCustomers: number;
  completedToday: number;
  unavailableToday: number;
  needWashToday: number;
  remainingToday: number;
  actualEarnedToday: number;
  potentialDailyEarnings: number;
  potentialMonthlyEarnings: number;
  assignmentTotalCustomers: number;
  assignmentCompleted: number;
  targetCars: number;
  expectedDailyEarnings: number;
  expectedMonthlyEarnings: number;
  fetchedAt: number;
};

const CACHE_KEY = "uw:today-assignment:last-success";

function readCache(): TodayAssignmentData | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(CACHE_KEY) : null;
    return raw ? (JSON.parse(raw) as TodayAssignmentData) : null;
  } catch { return null; }
}
function writeCache(d: TodayAssignmentData) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch { /* noop */ }
}

async function fetchTodayAssignment(): Promise<TodayAssignmentData> {
  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!u.user) {
    return {
      assignment: null, all: [], today: [], nextDate: null,
      todaysCustomers: 0, completedToday: 0, 
      unavailableToday: 0, needWashToday: 0,
      remainingToday: 0,
      actualEarnedToday: 0, potentialDailyEarnings: 0, potentialMonthlyEarnings: 0,
      assignmentTotalCustomers: 0, assignmentCompleted: 0,
      targetCars: 0, expectedDailyEarnings: 0, expectedMonthlyEarnings: 0,
      fetchedAt: Date.now(),
    };
  }
  const now = new Date();
  const today = getTodayIST();
  const isMonday = now.getDay() === 1;

  // Resolve canonical partner identity for data fetching
  const { data: me } = await supabase
    .from("partners")
    .select("id")
    .or(`id.eq.${u.user.id},phone.eq.${u.user.phone?.replace('91', '') || 'NONE'},email.eq.${u.user.email}`)
    .maybeSingle();

  const partnerId = me?.id || u.user.id;

  const { data: a, error: aErr } = await supabase
    .from("assignments")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("status", "active")
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (aErr) throw aErr;

  // AUTHORITATIVE FALLBACK: Always fetch loose services for today regardless of assignment ID
  // This handles the "Failure A/B" where Admin Assign happens but Assignment ID linkage takes a moment.
  const { data: looseToday, error: lErr } = await supabase
    .from("services")
    .select("id,assignment_id,status,time_slot,sequence_no,started_at,completed_at,unavailable_reason,locked_position,manual_sequence_no,is_emergency,cluster_id,eta_at,travel_min,distance_km,destination_lat,destination_lng,destination_source,scheduled_date,customer_id,vehicle_id,rate_per_car,customers(full_name,area,address_line,phone,service_required_before,preferred_time,time_window_type,exact_time,latitude,longitude),vehicles(make,model,registration_number,color,front_image_path,parking_notes)")
    .eq("partner_id", partnerId)
    .eq("scheduled_date", today);
  
  if (lErr) throw lErr;

  const tds = (looseToday ?? []).filter((s: any) => s.status !== "covered_by_booking");
  const cCountToday = tds.filter((s: any) => s.status === "completed").length;
  const uCountToday = tds.filter((s: any) => s.status === "unavailable" && s.unavailable_reason !== "dirty_vehicle").length;
  const nCountToday = tds.filter((s: any) => s.status === "unavailable" && s.unavailable_reason === "dirty_vehicle").length;
  
  const standardRateDefault = 17;
  const exceptionRate = 12;

  const earnedToday = (cCountToday * standardRateDefault) + (uCountToday * exceptionRate) + (nCountToday * exceptionRate);
  const uniqueVehiclesToday = new Set(tds.map((s: any) => s.vehicle_id).filter(Boolean)).size;

  if (!a) {
    return {
      assignment: null, all: [], today: tds, nextDate: null,
      todaysCustomers: uniqueVehiclesToday,
      completedToday: cCountToday,
      unavailableToday: uCountToday,
      needWashToday: nCountToday,
      remainingToday: tds.filter((s: any) => s.status !== "completed" && s.status !== "unavailable").length,
      actualEarnedToday: earnedToday,
      potentialDailyEarnings: tds.length * standardRateDefault,
      potentialMonthlyEarnings: (tds.length * standardRateDefault) * 26,
      assignmentTotalCustomers: uniqueVehiclesToday, 
      assignmentCompleted: cCountToday,
      targetCars: 0, 
      expectedDailyEarnings: tds.length * standardRateDefault, 
      expectedMonthlyEarnings: (tds.length * standardRateDefault) * 26,
      fetchedAt: Date.now(),
    };
  }

  // Fetch all services for the assignment to get "all" and "nextDate"
  const { data: allServices, error: sErr } = await supabase
    .from("services")
    .select("id,assignment_id,status,time_slot,sequence_no,started_at,completed_at,unavailable_reason,locked_position,manual_sequence_no,is_emergency,cluster_id,eta_at,travel_min,distance_km,destination_lat,destination_lng,destination_source,scheduled_date,customer_id,vehicle_id,rate_per_car,customers(full_name,area,address_line,phone,service_required_before,preferred_time,time_window_type,exact_time,latitude,longitude),vehicles(make,model,registration_number,color,front_image_path,parking_notes)")
    .eq("assignment_id", a.id);
  if (sErr) throw sErr;

  const all = (allServices ?? []).filter((s: any) => s.status !== "covered_by_booking");
  
  // Merge assignment services with loose today services to ensure zero-latency propagation
  const assignmentServiceIds = new Set(all.map(s => s.id));
  const mergedToday = [...all.filter((s: any) => s.scheduled_date === today), ...tds.filter(s => !assignmentServiceIds.has(s.id))];

  const nextDate = all
    .map((s: any) => s.scheduled_date as string)
    .filter((d) => d && d > today)
    .sort()[0] ?? null;

  const targetCars = Number(a.target_cars || 0);
  const ratePerCar = Number(a.rate_per_car || standardRateDefault);
  
  const mergedTotalCustomers = new Set(mergedToday.map((s: any) => s.vehicle_id).filter(Boolean)).size;
  const effectiveCustomerCount = mergedTotalCustomers > 0 ? mergedTotalCustomers : targetCars;
  
  const potentialDailyEarnings = effectiveCustomerCount * ratePerCar;
  
  const cCountMerged = mergedToday.filter((s: any) => s.status === "completed").length;
  const uCountMerged = mergedToday.filter((s: any) => s.status === "unavailable" && s.unavailable_reason !== "dirty_vehicle").length;
  const nCountMerged = mergedToday.filter((s: any) => s.status === "unavailable" && s.unavailable_reason === "dirty_vehicle").length;

  const actualEarnedTodayMerged = (cCountMerged * ratePerCar) + (uCountMerged * exceptionRate) + (nCountMerged * exceptionRate);

  return {
    assignment: a,
    all,
    today: mergedToday,
    nextDate,
    todaysCustomers: isMonday ? 0 : mergedTotalCustomers,
    completedToday: isMonday ? 0 : cCountMerged,
    unavailableToday: isMonday ? 0 : uCountMerged,
    needWashToday: isMonday ? 0 : nCountMerged,
    remainingToday: isMonday ? 0 : mergedToday.filter((s: any) => s.status !== "completed" && s.status !== "unavailable").length,
    actualEarnedToday: isMonday ? 0 : actualEarnedTodayMerged,
    potentialDailyEarnings,
    potentialMonthlyEarnings: potentialDailyEarnings * 26,
    assignmentTotalCustomers: mergedTotalCustomers,
    assignmentCompleted: cCountMerged,
    targetCars,
    expectedDailyEarnings: potentialDailyEarnings,
    expectedMonthlyEarnings: potentialDailyEarnings * 26,
    fetchedAt: Date.now(),
  };
}

export function useTodayAssignment() {
  const [metrics, setMetrics] = useState({
    successes: 0, failures: 0, retryAttempts: 0,
    lastError: null, lastSuccessAt: null, successRate: 1,
  });
  const cachedRef = useRef<TodayAssignmentData | null>(readCache());

  const q = useQuery<TodayAssignmentData>({
    queryKey: ["today-assignment"],
    queryFn: fetchTodayAssignment,
    staleTime: 5_000,
    refetchOnMount: "always",
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev ?? cachedRef.current ?? undefined,
    retry: (failureCount, error) => {
      setMetrics((m: any) => ({
        ...m,
        retryAttempts: m.retryAttempts + 1,
        lastError: (error as any)?.message ?? String(error),
      }));
      return failureCount < 4;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  useEffect(() => {
    if (q.isSuccess && q.data) {
      writeCache(q.data);
      cachedRef.current = q.data;
      setMetrics((m: any) => {
        const successes = m.successes + 1;
        const total = successes + m.failures;
        return {
          ...m,
          successes,
          lastSuccessAt: q.data.fetchedAt,
          lastError: null,
          successRate: total > 0 ? successes / total : 1,
        };
      });
    }
  }, [q.isSuccess, q.data]);

  useEffect(() => {
    if (q.isError) {
      setMetrics((m: any) => {
        const failures = m.failures + 1;
        const total = m.successes + failures;
        return {
          ...m,
          failures,
          lastError: (q.error as any)?.message ?? String(q.error),
          successRate: total > 0 ? m.successes / total : 0,
        };
      });
    }
  }, [q.isError, q.error]);

  const lastGood = cachedRef.current;
  return { ...q, metrics, lastGood };
}
