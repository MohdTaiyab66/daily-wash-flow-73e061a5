import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/admin/trial-verify")({
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
        const { runTrialVerify } = await import("@/lib/trial-seed.server");
        const report = await runTrialVerify();
        return new Response(JSON.stringify(report, null, 2), {
          status: report.ok ? 200 : 500,
          headers: { "content-type": "application/json" },
        });
      },
      GET: async ({ request }) => {
        const expected = process.env.TRIAL_SEED_SECRET;
        const got = request.headers.get("x-trial-secret");
        if (!expected || !got || got !== expected) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 401, headers: { "content-type": "application/json" },
          });
        }
        const { runTrialVerify } = await import("@/lib/trial-seed.server");
        const report = await runTrialVerify();
        return new Response(JSON.stringify(report, null, 2), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
