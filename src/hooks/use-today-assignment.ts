import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shape of the unified "today assignment" payload consumed by
 * Home, Live Route and My Assignment. This is the single source of
 * truth — every partner screen must derive today's customer counts
 * from this query so they can never drift.
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
    // Legacy fallback: loose services scheduled for today.
    const { data: loose, error: lErr } = await supabase
      .from("services")
      .select("id,customer_id,status,started_at,completed_at,rate_per_car,scheduled_date")
      .eq("partner_id", u.user.id)
      .eq("scheduled_date", today);
    if (lErr) throw lErr;
    const tds = loose ?? [];
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
    .select("id,customer_id,status,started_at,completed_at,rate_per_car,scheduled_date")
    .eq("assignment_id", a.id);
  if (sErr) throw sErr;
  const all = services ?? [];
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

/**
 * Shared today-assignment query. All partner screens (Home, Live, My
 * Assignment) subscribe to this so the customer counts stay identical
 * across the app. Fails loudly with 4 retries + exponential backoff so
 * transient network errors don't collapse to "0 customers".
 */
export function useTodayAssignment() {
  return useQuery<TodayAssignmentData>({
    queryKey: ["today-assignment"],
    queryFn: fetchTodayAssignment,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}
