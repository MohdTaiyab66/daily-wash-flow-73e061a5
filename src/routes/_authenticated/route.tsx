import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: true,
  beforeLoad: async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) {
      // Determine correct auth login page if possible, default to /auth (Partner/Admin)
      throw redirect({ to: "/auth" });
    }
    return { user: session.user };
  },
  component: () => <Outlet />,
});
