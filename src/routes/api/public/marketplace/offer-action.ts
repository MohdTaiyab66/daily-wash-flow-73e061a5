/**
 * Accept / Decline a marketplace offer straight from an Android notification.
 *
 * The action token is a short-lived (3 min), single-use nonce minted by the
 * push dispatcher and delivered inside the FCM data payload. The native
 * OfferActionReceiver POSTs it here from the notification tap. No user JWT
 * is required — the token itself proves the caller is the partner who
 * received the offer.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(10).max(200),
  action: z.enum(["accept", "decline"]),
});

async function handle(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, reason: "invalid_input" }, { status: 400 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("mp_consume_action_token", {
    p_token: parsed.data.token,
    p_action: parsed.data.action,
  });
  if (error) {
    return Response.json({ ok: false, reason: "server_error", detail: error.message }, { status: 500 });
  }
  return Response.json(data ?? { ok: false, reason: "unknown" });
}

export const Route = createFileRoute("/api/public/marketplace/offer-action")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      // CORS preflight — some Android WebView / OkHttp clients still probe.
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        }),
    },
  },
});
