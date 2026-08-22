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

  // Resolve canonical partner identity using the secure resolver
  const { data: partnerId } = await supabase.rpc("resolve_partner_id", { u_id: u.user.id } as any);
  
  if (!partnerId) {
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

  // AUTHORITATIVE PARTNER WORK SOURCE: Fetch all assigned work for today via RPC
  const { data: work, error: workErr } = await supabase.rpc("get_partner_work", { p_partner_id: partnerId });
  if (workErr) throw workErr;

  const todayStr = getTodayIST();
  const isMonday = new Date().getDay() === 1;

  // Map RPC results to expected UI shape
  const today = (work ?? []).map((w: any) => ({
    id: w.service_id,
    assignment_id: w.assignment_id,
    status: w.service_status,
    scheduled_date: w.scheduled_date,
    scheduled_time: w.scheduled_time,
    booking_id: w.booking_id,
    customer_id: w.customer_id,
    vehicle_id: w.vehicle_id,
    rate_per_car: w.earning_value,
    customers: {
      full_name: w.customer_name,
      phone: w.customer_phone,
      latitude: w.location_lat,
      longitude: w.location_lng,
      address_line: w.address
    },
    vehicles: {
      make: w.vehicle_name?.split(' ')[0] || '',
      model: w.vehicle_name?.split(' ').slice(1).join(' ') || '',
      registration_number: w.vehicle_number
    }
  }));

  const cCount = today.filter((s: any) => s.status === "completed").length;
  const uCount = today.filter((s: any) => s.status === "unavailable").length; // Need Wash logic handled by RPC/status logic
  
  // Potential and actual earnings logic
  const actualEarnedToday = today
    .filter((s: any) => s.status === "completed")
    .reduce((sum: number, s: any) => sum + (s.rate_per_car || 0), 0);
  
  const potentialDailyEarnings = today.reduce((sum: number, s: any) => sum + (s.rate_per_car || 0), 0);
  
  const uniqueVehicles = new Set(today.map((s: any) => s.vehicle_id).filter(Boolean)).size;

  // Get active assignment details for metrics
  const { data: activeAssignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("partner_id", partnerId)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

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
    assignmentTotalCustomers: uniqueVehicles,
    assignmentCompleted: cCount,
    targetCars: activeAssignment?.target_cars || uniqueVehicles,
    expectedDailyEarnings: potentialDailyEarnings,
    expectedMonthlyEarnings: potentialDailyEarnings * 26,
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
