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
  const { data: ents } = await sb
    .from("subscription_entitlements")
    .select("id,user_id,vehicle_id,subscription_id,consumed,total_allocated,cycle_start,cycle_end,benefit_type")
    .eq("benefit_type", "included_wash")
    .lte("cycle_start", today)
    .gte("cycle_end", today)
    .limit(5000);
  const week = today;
  let n = 0;
  for (const e of ents ?? []) {
    const remaining = (e.total_allocated ?? 0) - (e.consumed ?? 0);
    if (remaining <= 0) continue;
    if (!e.user_id) continue;
    const inserted = await upsertNotification(
      sb,
      {
        user_id: e.user_id,
        vehicle_id: e.vehicle_id ?? null,
        type: "weekly_wash_reminder",
        title: "Washes still available",
        body: `You have ${remaining} included wash${remaining === 1 ? "" : "es"} remaining this cycle.`,
        link: "/c/subscriptions",
        metadata: { subscription_id: e.subscription_id, remaining },
      },
      `weekly:${week}:${e.id}`,
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
    .eq("status", "active")
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
            type: "subscription_expiring_soon",
            title: "Your plan ends in 3 days",
            body: "Your plan won't auto-renew. Tap to reactivate before it ends.",
            link: "/c/subscriptions",
            metadata: { subscription_id: s.id, ends_on: s.renewal_date },
          }
        : {
            user_id: s.user_id,
            vehicle_id: s.vehicle_id ?? null,
            type: "subscription_renewing_soon",
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

export const Route = createFileRoute("/api/public/cron/daily-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const sb = await admin();
        const [weekly, renewal] = await Promise.all([
          weeklyIncludedWashReminder(sb).catch(() => 0),
          renewalReminder(sb).catch(() => 0),
        ]);
        return Response.json({ ok: true, weekly, renewal });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to dispatch" }),
    },
  },
});
