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

const CACHE_KEY = "uw:today-assignment:last-success-v2";

function readCache(): TodayAssignmentData | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(CACHE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TodayAssignmentData;
    // Discard blank snapshots written by older builds — they made active
    // partners look like they had no assignment.
    if (!parsed?.assignment && (parsed?.all?.length ?? 0) === 0) {
      try { window.localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
      return null;
    }
    return parsed;
  } catch { return null; }
}
function writeCache(d: TodayAssignmentData) {
  // Never persist an "empty" payload — a transient auth/network hiccup must not
  // overwrite a partner's real assignment with a blank state.
  if (!d.assignment && d.all.length === 0) return;
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch { /* noop */ }
}

async function fetchTodayAssignment(): Promise<TodayAssignmentData> {
  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!u.user) {
    // Transient: session not hydrated yet. Throw so React Query retries and
    // keeps the last known good data on screen instead of blanking it.
    throw new Error("AUTH_NOT_READY");
  }

  // Resolve canonical partner identity using the secure resolver
  const { data: partnerId, error: pErr } = await supabase.rpc("resolve_partner_id", { u_id: u.user.id } as any);
  if (pErr) throw pErr;

  if (!partnerId) {
    throw new Error("PARTNER_NOT_RESOLVED");
  }

  // AUTHORITATIVE PARTNER WORK SOURCE: Fetch all assigned work for today via RPC
  const { data: work, error: workErr } = await (supabase.rpc as any)("get_partner_work", { p_partner_id: partnerId });
  if (workErr) throw workErr;

  const todayStr = getTodayIST();
  const isMonday = new Date().getDay() === 1;

  // Get active assignment details for metrics FIRST
  // This ensures we have the assignment record even if get_partner_work returns empty
  const { data: activeAssignment, error: aErr } = await supabase
    .from("assignments")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Surface the failure instead of silently rendering "no assignment".
  if (aErr) throw aErr;

  // Map RPC results to expected UI shape
  const today = ((work as any[]) ?? []).map((w: any) => ({
    id: w.service_id,
    assignment_id: w.assignment_id,
    status: w.status || w.service_status,
    scheduled_date: w.scheduled_date,
    scheduled_time: w.time_slot || w.scheduled_time,
    booking_id: w.booking_id,
    customer_id: w.customer_id,
    vehicle_id: w.vehicle_id,
    rate_per_car: w.rate_per_car || w.earning_value,
    customers: {
      full_name: w.customer_name,
      phone: w.contact_number || w.customer_phone,
      latitude: w.latitude || w.location_lat,
      longitude: w.longitude || w.location_lng,
      address_line: w.address
    },
    vehicles: {
      make: w.vehicle_model?.split(' ')[0] || w.vehicle_name?.split(' ')[0] || '',
      model: w.vehicle_model?.split(' ').slice(1).join(' ') || w.vehicle_name?.split(' ').slice(1).join(' ') || '',
      registration_number: w.vehicle_number
    }
  }));

  const cCount = today.filter((s: any) => s.status === "completed").length;
  const uCount = today.filter((s: any) => s.status === "unavailable").length;

  // Potential and actual earnings logic
  const actualEarnedToday = today
    .filter((s: any) => s.status === "completed")
    .reduce((sum: number, s: any) => sum + (s.rate_per_car || 0), 0);
  
  const potentialDailyEarnings = today.reduce((sum: number, s: any) => sum + (s.rate_per_car || 0), 0);
  
  const uniqueVehicles = new Set(today.map((s: any) => s.vehicle_id).filter(Boolean)).size;



  return {
    assignment: activeAssignment,
    all: today,
    today: today,
    nextDate: null, // Derived from RPC if needed
    todaysCustomers: isMonday ? 0 : uniqueVehicles,
    completedToday: isMonday ? 0 : cCount,
    unavailableToday: isMonday ? 0 : uCount,
    needWashToday: 0, // Consolidated into unavailable or specific status
    remainingToday: isMonday ? 0 : today.filter((s: any) => s.status === "pending" || s.status === "in_progress").length,
    actualEarnedToday: isMonday ? 0 : actualEarnedToday,
    potentialDailyEarnings,
    potentialMonthlyEarnings: potentialDailyEarnings * 26,
    assignmentTotalCustomers: activeAssignment?.target_cars || uniqueVehicles,
    assignmentCompleted: cCount,
    targetCars: activeAssignment?.target_cars || uniqueVehicles,
    expectedDailyEarnings: activeAssignment ? (activeAssignment.target_cars * (activeAssignment.rate_per_car || 17)) : potentialDailyEarnings,
    expectedMonthlyEarnings: activeAssignment ? (activeAssignment.target_cars * (activeAssignment.rate_per_car || 17) * 26) : potentialDailyEarnings * 26,

    fetchedAt: Date.now(),
  };
}

export type TodayAssignmentMetrics = {
  successes: number;
  failures: number;
  retryAttempts: number;
  lastError: string | null;
  lastSuccessAt: number | null;
  successRate: number; // 0..1
};

export function useTodayAssignment() {
  const [metrics, setMetrics] = useState<TodayAssignmentMetrics>({
    successes: 0, failures: 0, retryAttempts: 0,
    lastError: null, lastSuccessAt: null, successRate: 1,
  });
  const cachedRef = useRef<TodayAssignmentData | null>(readCache());

  const q = useQuery<TodayAssignmentData>({
    queryKey: ["today-assignment"],
    queryFn: fetchTodayAssignment,
    staleTime: 10_000,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
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
