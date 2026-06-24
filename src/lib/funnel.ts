// Lightweight booking-funnel tracker. Writes one row per event into
// public.funnel_events. RLS lets anyone insert; only admins can read.

import { supabase } from "@/integrations/supabase/client";

export type FunnelEvent =
  | "visit_splash"
  | "skip_login"
  | "otp_completed"
  | "vehicle_added_guest"
  | "booking_started"
  | "payment_completed";

const SESSION_KEY = "uw_funnel_session";

function sessionId() {
  if (typeof window === "undefined") return "ssr";
  let s = localStorage.getItem(SESSION_KEY);
  if (!s) {
    s = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SESSION_KEY, s);
  }
  return s;
}

export async function track(event: FunnelEvent, meta?: Record<string, unknown>) {
  try {
    const { data } = await supabase.auth.getUser();
    await (supabase as any).from("funnel_events").insert({
      event,
      session_id: sessionId(),
      user_id: data?.user?.id ?? null,
      meta: meta ?? null,
    });
  } catch {
    // analytics must never break the UI
  }
}
