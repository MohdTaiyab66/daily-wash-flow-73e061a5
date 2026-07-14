import { createFileRoute } from "@tanstack/react-router";

// Idempotent cron: credits active monthly add-ons into each subscription's
// current-cycle entitlements. Safe to run hourly; each (addon, cycle) applies once.
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
  const { data, error } = await (supabaseAdmin as any).rpc("materialize_monthly_addons");
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return Response.json({ ok: true, applied: data ?? 0 });
}

export const Route = createFileRoute("/api/public/cron/monthly-addons-materialize")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
