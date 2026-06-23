import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CustomerShell } from "@/components/customer/CustomerShell";

export const Route = createFileRoute("/c/_authed")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/c/auth" });
    if (!data.user.email?.endsWith("@customer.urbanwash.app")) {
      await supabase.auth.signOut({ scope: "local" });
      throw redirect({ to: "/c/auth" });
    }
  },
  component: () => (
    <CustomerShell>
      <Outlet />
    </CustomerShell>
  ),
});
