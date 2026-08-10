import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// `/c/location` is a layout for `/c/location/search`. Its own path just
// forwards to the search screen — but the layout MUST render <Outlet /> so
// the child route (search) can appear. Previously this rendered `null`,
// which silently blanked the child and left the previous page (e.g. the
// verify-OTP screen) visible even though the URL updated correctly.
export const Route = createFileRoute("/c/location")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user?.email?.endsWith("@customer.urbanwash.app")) {
      throw redirect({ to: "/c/auth" });
    }
    // Only bounce the bare `/c/location` URL — never intercept children like
    // `/c/location/search`, otherwise we redirect-loop the child away.
    if (location.pathname === "/c/location" || location.pathname === "/c/location/") {
      throw redirect({ to: "/c/location/search", search: {} });
    }

  },
  component: () => <Outlet />,
});
