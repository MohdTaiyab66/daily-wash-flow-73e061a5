import { createFileRoute } from "@tanstack/react-router";

// Admin-only trial seed. Idempotent.
// Auth (any of):
//   - Header  x-trial-secret: <TRIAL_SEED_SECRET>
//   - Bootstrap: no admin user_role exists yet (first-time setup)
export const Route = createFileRoute("/api/public/admin/trial-seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.TRIAL_SEED_SECRET;
        const got = request.headers.get("x-trial-secret");
        let authorized = !!(expected && got && got === expected);

        // Bootstrap path: only allowed outside of production AND when secret is unset.
        // In production, the secret header is the only accepted credential.
        if (!authorized && process.env.NODE_ENV !== "production" && !expected) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { count } = await supabaseAdmin
            .from("user_roles")
            .select("*", { count: "exact", head: true })
            .eq("role", "admin");
          if ((count ?? 0) === 0) authorized = true; // bootstrap (dev only)
        }


        if (!authorized) {
          return new Response(
            JSON.stringify({ error: "Forbidden — admin exists; send x-trial-secret header" }),
            { status: 401, headers: { "content-type": "application/json" } },
          );
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
