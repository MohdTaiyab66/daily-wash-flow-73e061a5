import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  remainingToday: number;
  assignmentTotalCustomers: number;
  assignmentCompleted: number;
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
      todaysCustomers: 0, completedToday: 0, remainingToday: 0,
      assignmentTotalCustomers: 0, assignmentCompleted: 0,
      fetchedAt: Date.now(),
    };
  }
  const today = new Date().toISOString().slice(0, 10);
  const { data: a, error: aErr } = await supabase
    .from("assignments")
    .select("*")
    .eq("partner_id", u.user.id)
    .eq("status", "active")
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (aErr) throw aErr;

  if (!a) {
    const { data: loose, error: lErr } = await supabase
      .from("services")
      .select("id,customer_id,vehicle_id,status,started_at,completed_at,rate_per_car,scheduled_date")
      .eq("partner_id", u.user.id)
      .eq("scheduled_date", today);
    if (lErr) throw lErr;
    // Same filter the Live Route screen uses — bookings covered elsewhere are
    // not part of the partner's route, so counts can never diverge.
    const tds = (loose ?? []).filter((s: any) => s.status !== "covered_by_booking");
    return {
      assignment: null, all: [], today: tds, nextDate: null,
      todaysCustomers: tds.length,
      completedToday: tds.filter((s: any) => s.status === "completed").length,
      remainingToday: tds.filter((s: any) => s.status !== "completed" && s.status !== "unavailable").length,
      assignmentTotalCustomers: 0, assignmentCompleted: 0,
      fetchedAt: Date.now(),
    };
  }

  const { data: services, error: sErr } = await supabase
    .from("services")
    .select("id,customer_id,vehicle_id,status,started_at,completed_at,rate_per_car,scheduled_date")
    .eq("assignment_id", a.id);
  if (sErr) throw sErr;
  const all = (services ?? []).filter((s: any) => s.status !== "covered_by_booking");
  const todays = all.filter((s: any) => s.scheduled_date === today);

  const nextDate = all
    .map((s: any) => s.scheduled_date as string)
    .filter((d) => d && d > today)
    .sort()[0] ?? null;

  return {
    assignment: a,
    all,
    today: todays,
    nextDate,
    todaysCustomers: todays.length,
    completedToday: todays.filter((s: any) => s.status === "completed").length,
    remainingToday: todays.filter((s: any) => s.status !== "completed" && s.status !== "unavailable").length,
    assignmentTotalCustomers: new Set(all.map((s: any) => s.customer_id).filter(Boolean)).size,
    assignmentCompleted: all.filter((s: any) => s.status === "completed").length,
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

/**
 * Shared today-assignment query with:
 *  - localStorage-backed last-successful fallback + timestamp
 *  - retry/success/failure metrics for the status banner
 */
export function useTodayAssignment() {
  const [metrics, setMetrics] = useState<TodayAssignmentMetrics>({
    successes: 0, failures: 0, retryAttempts: 0,
    lastError: null, lastSuccessAt: null, successRate: 1,
  });
  const cachedRef = useRef<TodayAssignmentData | null>(readCache());

  const q = useQuery<TodayAssignmentData>({
    queryKey: ["today-assignment"],
    queryFn: fetchTodayAssignment,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev ?? cachedRef.current ?? undefined,
    retry: (failureCount, error) => {
      setMetrics((m) => ({
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
      setMetrics((m) => {
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
      setMetrics((m) => {
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
