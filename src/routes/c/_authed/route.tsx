import { createFileRoute, Outlet, redirect, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { useFcmRegistration } from "@/lib/push/use-fcm-registration";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authLog } from "@/lib/auth-debug";
import { CUSTOMER_APP_VERSION, CUSTOMER_BUILD_ID } from "@/lib/buildInfo";
import { useAuth } from "@/components/customer/AuthProvider";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/c/_authed")({
  ssr: false,
  beforeLoad: async () => {
    authLog.trace("[AUTH-SYNC] AUTH_GATE_BEFORELOAD_START");
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user || !session.user.email?.endsWith("@customer.urbanwash.app")) {
      authLog.error("[AUTH-SYNC] AUTH_GATE_REDIRECTING", { hasSession: !!session });
      throw redirect({ to: "/c/auth", replace: true });
    }
  },
  component: CustomerAuthedLayout,
});

function CustomerAuthedLayout() {
  const { authStatus, session, clientId } = useAuth();
  const [diagVisible, setDiagVisible] = useState(false);
  const [directSession, setDirectSession] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      authLog.error("[AUTH-SYNC] AUTH_GATE_UNAUTHENTICATED_REDIRECT");
      navigate({ to: "/c/auth", replace: true });
    }
  }, [authStatus, navigate]);

  useFcmRegistration(session?.user?.id, "customer");

  const runSyncDiagnostic = async () => {
    const { data, error } = await supabase.auth.getSession();
    setDirectSession({
      hasSession: !!data.session,
      userId: data.session?.user?.id ?? null,
      error: error?.message ?? null
    });
    setDiagVisible(true);
    authLog.info("[AUTH-SYNC] AUTH_GATE_GET_SESSION", {
      hasSession: !!data.session,
      userId: data.session?.user?.id ?? null,
      error: error?.message ?? null,
      clientId: (window as any).__SUPABASE_CLIENT_ID
    });
  };

  const testSignedInReq = async () => {
    try {
      const { data, error } = await supabase.from('customer_profiles').select('id').limit(1);
      toast(error ? `REQ FAILED: ${error.message}` : "REQ SUCCESS");
    } catch (e: any) {
      toast.error(`REQ EXCEPTION: ${e.message}`);
    }
  };

  if (authStatus === 'initializing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFF9F3]">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#FF6B00] border-t-transparent" />
          <p className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-widest">Verifying Access...</p>
        </div>
      </div>
    );
  }

  return (
    <CustomerShell>
      {/* Build 1.0.44 Diagnostic Overlay */}
      <div className="fixed top-2 right-2 z-[10000] flex flex-col items-end gap-2">
        <div className="flex gap-1">
          <button 
            onClick={runSyncDiagnostic}
            className="text-[9px] font-bold bg-[#FF6B00] text-white px-2 py-1 rounded shadow active:scale-95"
          >
            TEST AUTH
          </button>
          <button 
            onClick={testSignedInReq}
            className="text-[9px] font-bold bg-green-600 text-white px-2 py-1 rounded shadow active:scale-95"
          >
            TEST REQ
          </button>
          <button 
            onClick={async () => {
              await supabase.auth.signOut();
              qc.clear();
              navigate({ to: "/c/auth", replace: true });
            }}
            className="text-[9px] font-bold bg-black text-white px-2 py-1 rounded shadow active:scale-95"
          >
            LOGOUT
          </button>
        </div>
        
        {diagVisible && (
          <div className="bg-black/95 text-white p-2.5 rounded-xl text-[9px] font-mono border border-white/20 shadow-2xl animate-in fade-in slide-in-from-top-2">
            <div className="border-b border-white/10 pb-1.5 mb-1.5">
              <p className="text-[#FF6B00] font-black">BUILD 1.0.44-auth-sync</p>
            </div>
            <div className="space-y-1">
              <p>AUTH STATUS: <span className={cn(authStatus === 'authenticated' ? 'text-green-400' : 'text-orange-400')}>{authStatus.toUpperCase()}</span></p>
              <p>GET SESSION: <span className={directSession?.hasSession ? 'text-green-400' : 'text-red-400'}>{directSession?.hasSession ? 'PRESENT' : 'MISSING'}</span></p>
              <p>CLIENT ID: <span className="text-blue-400 font-bold">{clientId}</span></p>
              <p>ROUTE: <span className="text-purple-400">{location.pathname}</span></p>
              <p>USER: <span className="text-blue-300">{session?.user ? 'PRESENT' : 'MISSING'}</span></p>
              {directSession?.error && <p className="text-red-500 font-bold">ERROR: {directSession.error}</p>}
              <button 
                onClick={() => setDiagVisible(false)}
                className="mt-2 w-full py-1 bg-white/10 hover:bg-white/20 rounded text-[8px] transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        )}
      </div>

      <Outlet />
    </CustomerShell>
  );
}
