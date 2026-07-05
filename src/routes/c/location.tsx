import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// The location page is unified with the address-selection search screen
// (single source of truth for picking a location — before or after login).
export const Route = createFileRoute("/c/location")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email?.endsWith("@customer.urbanwash.app")) {
      throw redirect({ to: "/c/auth" });
    }
    throw redirect({ to: "/c/location/search" });
  },
  component: () => null,
});
