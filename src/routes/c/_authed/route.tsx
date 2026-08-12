import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { useFcmRegistration } from "@/lib/push/use-fcm-registration";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getInitialCustomerContext } from "@/lib/customer-auth.functions";
import { authLog } from "@/lib/auth-debug";

export const Route = createFileRoute("/c/_authed")({
  ssr: false,
  loader: async ({ context }) => {
    authLog.trace("Protected route loader started");
    
    // We do NOT block on getInitialCustomerContext here.
    // We let the page load and fetch what it needs.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      authLog.error("Protected route loader - No session");
      throw redirect({ to: "/c/auth" });
    }
    
    return null;
  },
  beforeLoad: async () => {
    authLog.trace("Protected route beforeLoad check (async start)");
    
    // Non-blocking session check
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      authLog.error("beforeLoad - No session");
      throw redirect({ to: "/c/auth" });
    }
    
    if (!session.user.email?.endsWith("@customer.urbanwash.app")) {
      authLog.error("beforeLoad - Invalid user domain", { email: session.user.email });
      await supabase.auth.signOut({ scope: "local" });
      throw redirect({ to: "/c/auth" });
    }
    
    authLog.trace("beforeLoad - Auth confirmed", { userId: session.user.id });
  },
  component: CustomerAuthedLayout,
});



function CustomerAuthedLayout() {
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Session expiry / remote sign-out: land on the login screen with a clear
  // message instead of a silently failing screen full of empty queries.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (event === "TOKEN_REFRESHED" && !session)) {
        void qc.cancelQueries();
        qc.clear();
        toast.info("Session expired. Please log in again.");
        navigate({ to: "/c/auth", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, qc]);

  useFcmRegistration(userId, "customer");
  // No live ETA / route sync for customers by design.
  return (
    <CustomerShell>
      <Outlet />
    </CustomerShell>
  );
}

