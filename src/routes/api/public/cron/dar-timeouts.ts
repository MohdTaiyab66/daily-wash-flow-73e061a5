import { createFileRoute } from "@tanstack/react-router";

// Cron endpoint that releases customers from partners who haven't started their
// route by the admin-configured deadline. Runs every few minutes; the underlying
// RPC is a no-op before the cutoff time (defaults to 10:00 Asia/Kolkata).
//
// Auth: matches the existing assignment-tick pattern (x-cron-secret header).
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
  const { data, error } = await (supabaseAdmin as any).rpc("dar_check_start_timeouts");
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }
  return Response.json({ ok: true, triggered: data ?? 0 });
}

export const Route = createFileRoute("/api/public/cron/dar-timeouts")({
  server: {
    handlers: {
      POST: async ({ request }) => run(request),
      GET: async ({ request }) => run(request),
    },
  },
});
