import { createFileRoute, Outlet, redirect, useNavigate, useLocation, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { useFcmRegistration } from "@/lib/push/use-fcm-registration";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authLog, diagnoseSession } from "@/lib/auth-debug";
import { CUSTOMER_APP_VERSION, CUSTOMER_BUILD_ID } from "@/lib/buildInfo";

export const Route = createFileRoute("/c/_authed")({
  ssr: false,
  beforeLoad: async () => {
    authLog.trace("[AUTH-TRACE] 06 PROTECTED_BEFORELOAD_START");
    
    // Canonical Check 1: Session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      authLog.error("[AUTH-TRACE] REDIRECTING: NO SESSION IN BEFORELOAD");
      throw redirect({ to: "/c/auth", replace: true });
    }
    
    // Canonical Check 2: Domain
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
  const [sessionData, setSessionData] = useState<{ userId: string | null; email: string | null }>({ userId: null, email: null });
  const [diag, setDiag] = useState<any>(null);
  
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  // SINGLE SOURCE OF TRUTH: Initial Sync
  useEffect(() => {
    let cancelled = false;
    
    const syncAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      const user = data.session?.user;
      const isCustomer = !!user?.email?.endsWith("@customer.urbanwash.app");

      if (isCustomer) {
        setSessionData({ userId: user!.id, email: user!.email! });
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unauthenticated');
        authLog.error("[AUTH-P0] SHELL_SYNC: Unauthenticated, redirecting");
        navigate({ to: "/c/auth", replace: true });
      }
    };

    syncAuth();
    return () => { cancelled = true; };
  }, [navigate]);

  // SINGLE SOURCE OF TRUTH: Event Listener
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      authLog.info(`[AUTH-P0] SHELL AUTH EVENT: ${event}`, { sessionPresent: !!session });
      
      const user = session?.user;
      const isCustomer = !!user?.email?.endsWith("@customer.urbanwash.app");

      if (event === "SIGNED_OUT" || !isCustomer) {
        setAuthStatus('unauthenticated');
        void qc.invalidateQueries();
        if (event === "SIGNED_OUT") toast.info("Signed out successfully.");
        navigate({ to: "/c/auth", replace: true });
      } else if (session) {
        setSessionData({ userId: user!.id, email: user!.email! });
        setAuthStatus('authenticated');
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, qc]);

  useFcmRegistration(sessionData.userId, "customer");

  const runDiagnostic = async () => {
    const res = await diagnoseSession();
    setDiag(res);
    toast.success("Auth diagnostic complete");
  };

  const testSignedInReq = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert("NO SESSION — REQUEST NOT SENT");
      return;
    }
    try {
      const { data, error } = await supabase.from('customer_profiles').select('id').limit(1);
      alert(error ? `ERROR: ${error.message}` : "SUCCESS: Profile accessible");
    } catch (e: any) {
      alert(`EXCEPTION: ${e.message}`);
    }
  };

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

  if (authStatus === 'unauthenticated') return null;

  return (
    <CustomerShell>
      <div className="fixed top-2 right-2 z-[10000] flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button 
            onClick={runDiagnostic}
            className="text-[9px] font-mono bg-blue-600 text-white px-2 py-1 rounded shadow-lg active:scale-95"
          >
            TEST AUTH
          </button>
          <button 
            onClick={testSignedInReq}
            className="text-[9px] font-mono bg-green-600 text-white px-2 py-1 rounded shadow-lg active:scale-95"
          >
            TEST REQ
          </button>
          <button 
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/c/auth", replace: true });
            }}
            className="text-[9px] font-mono bg-black text-white px-2 py-1 rounded shadow-lg active:scale-95"
          >
            LOGOUT
          </button>
        </div>
        
        {diag && (
          <div className="bg-black/90 text-white p-2 rounded text-[8px] font-mono border border-white/20 animate-in fade-in slide-in-from-top-1">
            <p>SESSION: {diag.hasSession ? 'PRESENT' : 'MISSING'}</p>
            <p>USER: {diag.userId || 'NONE'}</p>
            <p>EMAIL: {diag.email || 'NONE'}</p>
          </div>
        )}
      </div>

      <div className="fixed top-10 left-0 right-0 flex flex-col items-center gap-1 opacity-20 pointer-events-none">
        <span className="text-[10px] font-mono tracking-tighter text-blue-500">ROUTE: {location.pathname}</span>
        <span className="text-[10px] font-mono tracking-tighter text-orange-500">BUILD: {CUSTOMER_APP_VERSION}-{CUSTOMER_BUILD_ID}</span>
      </div>

      <Outlet />
    </CustomerShell>
  );
}
