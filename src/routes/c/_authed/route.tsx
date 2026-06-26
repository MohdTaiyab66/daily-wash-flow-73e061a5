import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { useFcmRegistration } from "@/lib/push/use-fcm-registration";

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
  component: CustomerAuthedLayout,
});

function CustomerAuthedLayout() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useFcmRegistration(userId, "customer");
  return (
    <CustomerShell>
      <Outlet />
    </CustomerShell>
  );
}

