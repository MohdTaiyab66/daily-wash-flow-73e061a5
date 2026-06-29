import { createFileRoute } from "@tanstack/react-router";

// Authenticated cron endpoint — requires x-cron-secret matching CRON_SECRET env.
// Fails closed when CRON_SECRET is unset, so a misconfigured deploy cannot expose this RPC.
async function run(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const got = request.headers.get("x-cron-secret");
  if (!expected || !got || got !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("sweep_subscription_offers");
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  return Response.json({ ok: true, processed: data ?? 0 });
}

export const Route = createFileRoute("/api/public/cron/assignment-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
