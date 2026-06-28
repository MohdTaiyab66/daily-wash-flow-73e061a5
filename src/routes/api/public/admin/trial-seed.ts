import { createFileRoute } from "@tanstack/react-router";

// One-time admin-only trial seed endpoint.
// Auth: send header "x-trial-secret: <TRIAL_SEED_SECRET>".
// Idempotent — safe to re-run.

export const Route = createFileRoute("/api/public/admin/trial-seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.TRIAL_SEED_SECRET;
        const got = request.headers.get("x-trial-secret");
        if (!expected || !got || got !== expected) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 401, headers: { "content-type": "application/json" },
          });
        }
        const { runTrialSeed } = await import("@/lib/trial-seed.server");
        const report = await runTrialSeed();
        return new Response(JSON.stringify(report, null, 2), {
          status: report.ok ? 200 : 500,
          headers: { "content-type": "application/json" },
        });
      },
      GET: async () => new Response("Use POST with x-trial-secret header.", { status: 405 }),
    },
  },
});
