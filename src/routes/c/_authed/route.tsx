import { createFileRoute, Outlet, redirect, useNavigate, useLocation } from "@tanstack/react-router";
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
    authLog.trace("[AUTH-TRACE] 06 PROTECTED_LOADER_START");
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      authLog.error("[AUTH-TRACE] REDIRECTING: NO SESSION IN LOADER");
      throw redirect({ to: "/c/auth", replace: true });
    }
    
    return null;
  },
  beforeLoad: async () => {
    authLog.trace("[AUTH-TRACE] 06 PROTECTED_BEFORELOAD_START");
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      authLog.error("[AUTH-TRACE] REDIRECTING: NO SESSION IN BEFORELOAD");
      throw redirect({ to: "/c/auth", replace: true });
    }
    
    if (!session.user.email?.endsWith("@customer.urbanwash.app")) {
      authLog.error("[AUTH-TRACE] REDIRECTING: INVALID DOMAIN", { email: session.user.email });
      await supabase.auth.signOut({ scope: "local" });
      throw redirect({ to: "/c/auth", replace: true });
    }
    
    authLog.trace("[AUTH-TRACE] 13 AUTHENTICATED_CONFIRMED", { userId: session.user.id });
  },
  component: CustomerAuthedLayout,
});

function CustomerAuthedLayout() {
  const [authStatus, setAuthStatus] = useState<'initializing' | 'authenticated' | 'unauthenticated'>('initializing');
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    // Non-blocking UI update for user ID
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        if (data.session?.user?.email?.endsWith("@customer.urbanwash.app")) {
          setAuthStatus('authenticated');
          setUserId(data.session.user.id);
        } else {
          setAuthStatus('unauthenticated');
          navigate({ to: "/c/auth", replace: true });
        }
      }
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

  if (authStatus === 'initializing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFF9F3]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-bold text-muted-foreground/60 uppercase tracking-widest">Verifying Access...</p>
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return null; // Navigation is already triggered in useEffect
  }

  return (
    <CustomerShell>
      <div className="fixed top-10 left-0 right-0 flex flex-col items-center gap-1 opacity-10 pointer-events-none">
        <span className="text-[10px] font-mono tracking-tighter text-blue-500">ROUTE: {location.pathname}</span>
      </div>
      <Outlet />
    </CustomerShell>
  );
}
