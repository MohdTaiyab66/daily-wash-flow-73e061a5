/**
 * Shared authorization for pg_cron / scheduler-invoked public endpoints.
 *
 * Accepts EITHER:
 *  - `x-cron-secret: <CRON_SECRET>`  (legacy shared-secret header), or
 *  - `apikey: <SUPABASE_PUBLISHABLE_KEY>` (the documented pg_cron pattern, and
 *    what the scheduled jobs in this project actually send).
 *
 * Env is read at call time (Workers inject env per-request), never at module scope.
 */
export function isAuthorizedCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const got = request.headers.get("x-cron-secret");
  if (cronSecret && got && got === cronSecret) return true;

  const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
  const apikey = request.headers.get("apikey");
  if (anon && apikey && apikey === anon) return true;

  return false;
}

export function cronForbidden(): Response {
  return new Response(JSON.stringify({ ok: false, error: "forbidden" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
