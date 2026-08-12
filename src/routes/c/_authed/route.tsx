import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { useFcmRegistration } from "@/lib/push/use-fcm-registration";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authLog } from "@/lib/auth-debug";

export const Route = createFileRoute("/c/_authed")({
  ssr: false,
  loader: async () => {
    authLog.trace("[AUTH][SHELL] Protected route loader started");
    
    // Non-blocking session check for the loader
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      authLog.error("[AUTH][SHELL] Protected route loader - No session present. Redirecting to login.");
      throw redirect({ to: "/c/auth" });
    }
    
    return null;
  },
  beforeLoad: async () => {
    authLog.trace("[AUTH][SHELL] Protected route beforeLoad check");
    
    // We use getSession here because it's nearly instantaneous (local storage)
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      authLog.error("[AUTH][SHELL] beforeLoad - No session present. Redirecting to login.");
      throw redirect({ to: "/c/auth" });
    }
    
    if (!session.user.email?.endsWith("@customer.urbanwash.app")) {
      authLog.error("[AUTH][SHELL] beforeLoad - Invalid user domain", { email: session.user.email });
      await supabase.auth.signOut({ scope: "local" });
      throw redirect({ to: "/c/auth" });
    }
    
    authLog.trace("[AUTH][SHELL] beforeLoad - Auth confirmed", { userId: session.user.id });
  },
  component: CustomerAuthedLayout,
});

function CustomerAuthedLayout() {
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    // Non-blocking UI update for user ID
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUserId(data.session?.user?.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[AUTH-P0] SHELL AUTH EVENT: ${event}`, { sessionPresent: !!session });
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        console.log("[AUTH-P0] SESSION LOST/SIGNED OUT. Navigating to login.");
        void qc.invalidateQueries();
        toast.info("Session expired. Please log in again.");
        navigate({ to: "/c/auth", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, qc]);

  useFcmRegistration(userId, "customer");

  return (
    <CustomerShell>
      <Outlet />
    </CustomerShell>
  );
}
