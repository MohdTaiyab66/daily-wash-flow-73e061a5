import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cron/assignment-tick")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any).rpc("sweep_subscription_offers");
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        return Response.json({ ok: true, processed: data ?? 0 });
      },
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any).rpc("sweep_subscription_offers");
        if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        return Response.json({ ok: true, processed: data ?? 0 });
      },
    },
  },
});
