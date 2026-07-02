/**
 * Notification push dispatcher.
 *
 * Called by pg_cron every minute. Finds recent unpushed notifications in
 *   - customer_notifications (service_reassigned)
 *   - partner_notifications  (new_assignments, offer_accepted, etc.)
 *   - admin_alerts           (dar_event and similar)
 * and dispatches an FCM push to every registered device for the recipient.
 *
 * Notifications are marked `pushed_at = now()` so retries are idempotent.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sendOfferPush } from "@/lib/push/send.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function dispatchCustomer(sb: any) {
  const { data: rows } = await sb
    .from("customer_notifications")
    .select("id,user_id,title,body,type,link")
    .is("pushed_at", null)
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(50);
  for (const r of rows ?? []) {
    try {
      await sendOfferPush({
        userId: r.user_id,
        title: r.title,
        body: r.body ?? "",
        data: { type: r.type ?? "notification", link: r.link ?? "" },
        channelId: "general",
      });
    } catch {
      /* keep going */
    }
    await sb.from("customer_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
  }
  return rows?.length ?? 0;
}

async function dispatchPartner(sb: any) {
  const { data: rows } = await sb
    .from("partner_notifications")
    .select("id,partner_id,title,body,type,link")
    .is("pushed_at", null)
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(50);
  for (const r of rows ?? []) {
    try {
      await sendOfferPush({
        userId: r.partner_id,
        title: r.title,
        body: r.body ?? "",
        data: { type: r.type ?? "notification", link: r.link ?? "" },
        channelId: r.type === "new_assignments" ? "assignments" : "general",
      });
    } catch {
      /* noop */
    }
    await sb.from("partner_notifications").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
  }
  return rows?.length ?? 0;
}

async function dispatchAdmin(sb: any) {
  const { data: rows } = await sb
    .from("admin_alerts")
    .select("id,title,body,kind,meta")
    .is("pushed_at", null)
    .gt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .limit(20);
  if (!rows?.length) return 0;
  const { data: admins } = await sb.rpc("get_admin_user_ids").catch(() => ({ data: null }));
  const adminIds: string[] = (admins ?? []).map((x: any) => x.user_id ?? x);
  for (const r of rows) {
    for (const uid of adminIds) {
      try {
        await sendOfferPush({
          userId: uid,
          title: r.title,
          body: r.body ?? "",
          data: { type: "admin_alert", kind: r.kind ?? "" },
          channelId: "general",
        });
      } catch {
        /* noop */
      }
    }
    await sb.from("admin_alerts").update({ pushed_at: new Date().toISOString() }).eq("id", r.id);
  }
  return rows.length;
}

export const Route = createFileRoute("/api/public/hooks/notification-push")({
  server: {
    handlers: {
      POST: async () => {
        const sb = await admin();
        const [c, p, a] = await Promise.all([dispatchCustomer(sb), dispatchPartner(sb), dispatchAdmin(sb)]);
        return Response.json({ ok: true, customer: c, partner: p, admin: a });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to dispatch" }),
    },
  },
});
