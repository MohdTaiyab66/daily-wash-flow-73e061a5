import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint — marks partners offline when their GPS/heartbeat has been
// silent for longer than the admin-configured timeout, and hands their
// remaining route to the DAR auto-recovery engine.
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
  const { data, error } = await (supabaseAdmin as any).rpc("dar_check_offline_partners");
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }
  return Response.json({ ok: true, triggered: data ?? 0 });
}

export const Route = createFileRoute("/api/public/cron/dar-offline-partners")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
