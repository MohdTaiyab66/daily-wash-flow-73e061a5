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
  syncWarning: string | null;
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

const REQUEST_TIMEOUT_MS = 8_000;

async function withTimeout<T>(request: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT`)), REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchTodayAssignment(): Promise<TodayAssignmentData> {
  // getSession reads the already-validated local session. getUser performs a
  // network request and could leave Home on its skeleton indefinitely on
  // patchy mobile connections.
  const { data: sessionData, error: sessionError } = await withTimeout(
    supabase.auth.getSession(),
    "SESSION",
  );
  if (sessionError) throw sessionError;
  if (!sessionData.session?.user) {
    // Transient: session not hydrated yet. Throw so React Query retries and
    // keeps the last known good data on screen instead of blanking it.
    throw new Error("AUTH_NOT_READY");
  }

  // Resolve canonical partner identity using the secure resolver
  const { data: partnerId, error: pErr } = await withTimeout(
    supabase.rpc("resolve_partner_id", { u_id: sessionData.session.user.id } as any),
    "PARTNER_ID",
  );
  if (pErr) throw pErr;

  if (!partnerId) {
    throw new Error("PARTNER_NOT_RESOLVED");
  }

  // Resolve the assignment independently from today's route. A broken or slow
  // service join must never hide a partner's valid active assignment.
  const assignmentRequest = supabase
      .from("assignments")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
  const workRequest = (supabase.rpc as any)("get_partner_work_v2", { p_partner_id: partnerId }) as PromiseLike<{
    data: any[] | null;
    error: unknown;
  }>;
  const [assignmentResult, workResult] = await Promise.allSettled([
    withTimeout(assignmentRequest, "ACTIVE_ASSIGNMENT"),
    withTimeout(workRequest, "PARTNER_WORK"),
  ]);

  if (assignmentResult.status === "rejected") throw assignmentResult.reason;
  const { data: activeAssignment, error: aErr } = assignmentResult.value;
  // Surface the failure instead of silently rendering "no assignment".
  if (aErr) throw aErr;

  let work: any[] = [];
  let syncWarning: string | null = null;
  if (workResult.status === "fulfilled" && !workResult.value.error) {
    work = (workResult.value.data as any[]) ?? [];
  } else {
    const workFailure = workResult.status === "rejected" ? workResult.reason : workResult.value.error;
    if (!activeAssignment) throw workFailure;
    syncWarning = workFailure instanceof Error ? workFailure.message : "PARTNER_WORK_UNAVAILABLE";
  }

  const todayStr = getTodayIST();
  // Map RPC results to expected UI shape
  const allWork = work.map((w: any) => ({
    id: w.service_id,
    assignment_id: w.assignment_id,
    status: w.service_status || w.status,
    scheduled_date: w.scheduled_date,
    scheduled_time: w.time_slot || w.scheduled_time,
    booking_id: w.booking_id,
    customer_id: w.customer_id,
    vehicle_id: w.vehicle_id,
    rate_per_car: Number(w.rate_per_car ?? w.earning_value ?? 0),
    unavailable_reason: w.unavailable_reason,
    sequence_no: w.sequence_no,
    manual_sequence_no: w.manual_sequence_no,
    eta_at: w.eta_at,
    distance_km: w.distance_km,
    started_at: w.started_at,
    completed_at: w.completed_at,
    destination_lat: w.destination_lat ?? w.latitude ?? null,
    destination_lng: w.destination_lng ?? w.longitude ?? null,
    customers: {
      full_name: w.customer_name,
      phone: w.customer_phone || w.contact_number,
      latitude: w.latitude ?? w.location_lat ?? null,
      longitude: w.longitude ?? w.location_lng ?? null,
      address_line: w.address
    },
    vehicles: {
      make: w.vehicle_make || w.vehicle_model?.split(' ')[0] || w.vehicle_name?.split(' ')[0] || '',
      model: w.vehicle_model || w.vehicle_name?.split(' ').slice(1).join(' ') || '',
      registration_number: w.vehicle_number
    }
  }));

  // The work feed also carries unfinished historical rows for recovery/audit.
  // Daily Route must only render today's IST services; otherwise old pending
  // rows inflate the sequence and can exceed the map provider's waypoint limit.
  const today = allWork.filter((service: any) => service.scheduled_date === todayStr);

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
    all: allWork,
    today: today,
    nextDate: null, // Derived from RPC if needed
    todaysCustomers: uniqueVehicles,
    completedToday: cCount,
    unavailableToday: today.filter((s: any) => s.status === "unavailable" && s.unavailable_reason !== "dirty_vehicle").length,
    needWashToday: today.filter((s: any) => s.status === "unavailable" && s.unavailable_reason === "dirty_vehicle").length,
    remainingToday: today.filter((s: any) => s.status === "pending" || s.status === "in_progress").length,
    actualEarnedToday,
    potentialDailyEarnings,
    potentialMonthlyEarnings: potentialDailyEarnings * 26,
    assignmentTotalCustomers: uniqueVehicles || activeAssignment?.target_cars || 0,
    assignmentCompleted: cCount,
    targetCars: uniqueVehicles || activeAssignment?.target_cars || 0,
    expectedDailyEarnings: potentialDailyEarnings || (activeAssignment ? (activeAssignment.target_cars * (activeAssignment.rate_per_car || 17)) : 0),
    expectedMonthlyEarnings: activeAssignment ? (activeAssignment.target_cars * (activeAssignment.rate_per_car || 17) * 26) : potentialDailyEarnings * 26,
    syncWarning,
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
    retry: (failureCount) => failureCount < 2,
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
