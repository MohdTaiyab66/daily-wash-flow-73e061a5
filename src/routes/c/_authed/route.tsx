import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { useFcmRegistration } from "@/lib/push/use-fcm-registration";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getInitialCustomerContext } from "@/lib/customer-auth.functions";

export const Route = createFileRoute("/c/_authed")({
  ssr: false,
  loader: async ({ context }) => {
    // Prefetch critical customer context in parallel
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw redirect({ to: "/c/auth" });
    
    // Fire off parallel fetch
    return context.queryClient.ensureQueryData({
      queryKey: ["customer-initial-context"],
      queryFn: () => getInitialCustomerContext(),
      staleTime: 1000 * 60 * 5, // 5 mins
    });
  },
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/c/auth" });
    if (!data.user.email?.endsWith("@customer.urbanwash.app")) {
      await supabase.auth.signOut({ scope: "local" });
      throw redirect({ to: "/c/auth" });
    }
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

