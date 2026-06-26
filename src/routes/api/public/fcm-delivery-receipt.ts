/**
 * Optional endpoint the native client can hit when it receives or opens a
 * notification. Records `push_delivered` / `opened` in offer_delivery_events.
 *
 * Public — performs only inserts into the audit log, scoped by the offer_id
 * the caller already knows. Validates the offer exists before inserting.
 */
import { createFileRoute } from "@tanstack/react-router";

type Body = {
  offer_id: string;
  queue_id?: string;
  partner_id?: string;
  stage: "push_delivered" | "opened" | "popup_displayed";
  meta?: Record<string, unknown>;
};

export const Route = createFileRoute("/api/public/fcm-delivery-receipt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        if (!body?.offer_id || !["push_delivered", "opened", "popup_displayed"].includes(body.stage)) {
          return new Response("Invalid payload", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: off, error: offErr } = await (supabaseAdmin as any)
          .from("subscription_offers")
          .select("id, queue_id, partner_id")
          .eq("id", body.offer_id)
          .maybeSingle();
        if (offErr || !off) return new Response("Unknown offer", { status: 404 });

        await (supabaseAdmin as any).from("offer_delivery_events").insert({
          offer_id: off.id,
          queue_id: body.queue_id ?? off.queue_id,
          partner_id: body.partner_id ?? off.partner_id,
          stage: body.stage,
          meta: body.meta ?? {},
        });
        return Response.json({ ok: true });
      },
    },
  },
});
