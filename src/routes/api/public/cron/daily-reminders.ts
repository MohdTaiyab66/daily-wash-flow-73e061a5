/**
 * Daily customer reminders dispatcher.
 *
 * Called by pg_cron once per day. Inserts customer_notifications rows for:
 *   - Weekly included wash reminder (Sundays: "You have N washes remaining this month")
 *   - Renewal reminder (subscription renews in ~3 days)
 *   - Expiry reminder (subscription ends in ~3 days and won't renew)
 *
 * The generic notification-push cron picks these rows up and delivers FCM.
 * Idempotent: each row uses a metadata.reminder_key that we dedupe on.
 */
import { createFileRoute } from "@tanstack/react-router";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

type Notif = {
  user_id: string;
  vehicle_id?: string | null;
  type: string;
  title: string;
  body: string;
  link: string;
  metadata: Record<string, unknown>;
};

async function upsertNotification(sb: any, n: Notif, key: string) {
  const { data: existing } = await sb
    .from("customer_notifications")
    .select("id")
    .eq("user_id", n.user_id)
    .eq("type", n.type)
    .contains("metadata", { reminder_key: key })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return false;
  await sb.from("customer_notifications").insert({
    ...n,
    metadata: { ...n.metadata, reminder_key: key },
  });
  return true;
}

async function weeklyIncludedWashReminder(sb: any) {
  // Only run on Sundays
  if (new Date().getUTCDay() !== 0) return 0;
  const today = new Date().toISOString().slice(0, 10);
  // Aggregate remaining across the two wash benefit types per subscription.
  // NOTE: `benefit_type` has no `included_wash` value; the wash-facing benefits
  // are `interior` (monthly deep clean) and `exterior_daily` (daily rinse).
  const { data: ents } = await sb
    .from("subscription_entitlements")
    .select("id,user_id,vehicle_id,subscription_id,consumed,total_allocated,cycle_start,cycle_end,benefit_type")
    .in("benefit_type", ["interior", "exterior_daily"])
    .lte("cycle_start", today)
    .gte("cycle_end", today)
    .limit(5000);

  // Group by subscription; sum remaining across benefit types.
  type Agg = { user_id: string; vehicle_id: string | null; subscription_id: string; remaining: number };
  const bySub = new Map<string, Agg>();
  for (const e of ents ?? []) {
    if (!e.user_id || !e.subscription_id) continue;
    if (e.total_allocated == null) continue; // skip unlimited benefits
    const remaining = Math.max(0, (e.total_allocated ?? 0) - (e.consumed ?? 0));
    if (remaining <= 0) continue;
    const cur = bySub.get(e.subscription_id);
    if (cur) cur.remaining += remaining;
    else bySub.set(e.subscription_id, { user_id: e.user_id, vehicle_id: e.vehicle_id ?? null, subscription_id: e.subscription_id, remaining });
  }

  const week = today;
  let n = 0;
  for (const [subId, a] of bySub) {
    const inserted = await upsertNotification(
      sb,
      {
        user_id: a.user_id,
        vehicle_id: a.vehicle_id,
        type: "weekly_included_reminder",
        title: "Washes still available",
        body: `You have ${a.remaining} included wash${a.remaining === 1 ? "" : "es"} remaining this cycle.`,
        link: "/c/subscriptions",
        metadata: { subscription_id: subId, remaining: a.remaining },
      },
      `weekly:${week}:${subId}`,
    );
    if (inserted) n++;
  }
  return n;
}

async function renewalReminder(sb: any) {
  const today = new Date();
  const target = new Date(today);
  target.setUTCDate(target.getUTCDate() + 3);
  const tStart = target.toISOString().slice(0, 10);
  const tEnd = new Date(target.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: subs } = await sb
    .from("subscriptions")
    .select("id,user_id,vehicle_id,renewal_date,cancel_at_period_end")
    .in("status", ["active", "assigned", "awaiting_partner_assignment"])
    .gte("renewal_date", tStart)
    .lt("renewal_date", tEnd)
    .limit(5000);

  let n = 0;
  for (const s of subs ?? []) {
    if (!s.user_id) continue;
    const isExpiring = !!s.cancel_at_period_end;
    const inserted = await upsertNotification(
      sb,
      isExpiring
        ? {
            user_id: s.user_id,
            vehicle_id: s.vehicle_id ?? null,
            type: "expiry_reminder",
            title: "Your plan ends in 3 days",
            body: "Your plan won't auto-renew. Tap to reactivate before it ends.",
            link: "/c/subscriptions",
            metadata: { subscription_id: s.id, ends_on: s.renewal_date },
          }
        : {
            user_id: s.user_id,
            vehicle_id: s.vehicle_id ?? null,
            type: "renewal_reminder",
            title: "Your plan renews in 3 days",
            body: "Your Urban Wash plan will auto-renew in 3 days. Manage from My Plan.",
            link: "/c/subscriptions",
            metadata: { subscription_id: s.id, renews_on: s.renewal_date },
          },
      `${isExpiring ? "expire" : "renew"}:${s.id}:${s.renewal_date}`,
    );
    if (inserted) n++;
  }
  return n;
}

/**
 * Company-side failures: any stop still `pending` after its scheduled day was
 * never started by Urban Wash. Those days must not be lost by the customer —
 * the plan is extended by one day and the customer is notified.
 */
async function extendCompanyFailures(sb: any) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await sb.rpc("auto_extend_company_failures", { p_date: yesterday });
  if (error) throw error;
  return Number(data?.extended ?? 0);
}

export const Route = createFileRoute("/api/public/cron/daily-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        const got = request.headers.get("x-cron-secret");
        if (!expected || !got || got !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        const sb = await admin();
        const [weekly, renewal, extended] = await Promise.all([
          weeklyIncludedWashReminder(sb).catch(() => 0),
          renewalReminder(sb).catch(() => 0),
          extendCompanyFailures(sb).catch(() => 0),
        ]);
        return Response.json({ ok: true, weekly, renewal, extended });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to dispatch" }),
    },
  },
});

