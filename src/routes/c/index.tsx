import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { authLog } from "@/lib/auth-debug";
import logo from "@/assets/logo.jpeg";

export const Route = createFileRoute("/c/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Urban Wash — Doorstep Car Care" },
      { name: "description", content: "Daily doorstep car care in Lucknow." },
    ],
  }),
  component: CustomerSplash,
});

/**
 * The ONE splash screen of the customer app.
 *
 * It resolves the persisted Supabase session as fast as it can and routes
 * straight through — signed-in users never see a second brand screen before
 * Home (auto-login), and signed-out users go directly to the login form.
 * A short floor keeps it from flashing on very fast devices.
 */
const MIN_SPLASH_MS = 300;
const AUTH_TIMEOUT_MS = 2000;
const SPLASH_BUILD_ID = "1.0.41-routing-fix";

function CustomerSplash() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    authLog.info("[AUTH-TRACE] 01 APP_START");

    const resolveAuth = async () => {
      authLog.info("[AUTH-TRACE] 03 SESSION_CHECK_START");
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Auth check timed out")), AUTH_TIMEOUT_MS)
      );

      try {
        const authPromise = supabase.auth.getSession();
        const { data }: any = await Promise.race([authPromise, timeoutPromise]);
        
        const sessionPresent = !!data.session;
        authLog.info(`[AUTH-TRACE] 04 SESSION_CHECK_RESULT: ${sessionPresent ? "PRESENT" : "MISSING"}`);
        
        const isCustomer = sessionPresent && !!data.session?.user?.email?.endsWith("@customer.urbanwash.app");
        authLog.info(`[AUTH-TRACE] 05 AUTH_STATE_SET: ${isCustomer ? "AUTHENTICATED" : "UNAUTHENTICATED"}`);
        
        if (cancelled) return;

        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
        
        authLog.info(`[AUTH-TRACE] 06 ROUTE_DECISION (in ${wait}ms): ${isCustomer ? "HOME" : "LOGIN"}`);

        window.setTimeout(() => {
          if (cancelled) return;
          authLog.info("[AUTH-TRACE] 14 EXECUTING_NAVIGATION");
          if (isCustomer) {
            const savedArea = localStorage.getItem("uw_customer_area");
            // If area is missing, we go to location search which is also protected by /c/location layout
            if (savedArea) {
              navigate({ to: "/c/home", replace: true });
            } else {
              navigate({ to: "/c/location/search", search: { returnTo: undefined }, replace: true });
            }
          } else {
            navigate({ to: "/c/auth", replace: true });
          }
        }, wait);

      } catch (err) {
        authLog.error("[AUTH-TRACE] 04 SESSION_CHECK_RESULT: ERROR", err);
        if (cancelled) return;
        // Definitive redirect to auth on error/timeout
        navigate({ to: "/c/auth", replace: true });
      }
    };

    resolveAuth();

    return () => { 
      cancelled = true; 
    };
  }, [navigate]);

  return (
    <div 
      className="flex min-h-screen flex-col items-center justify-center bg-[#FFF9F3] px-6"
      data-startup-marker="customer-splash"
    >
      <div className="-mt-16 flex flex-col items-center animate-in zoom-in-95 duration-1000">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          <img src={logo} alt="Urban Wash" className="relative h-28 w-28 rounded-[32px] object-cover shadow-2xl shadow-primary/20" />
        </div>
        <h1 className="mt-8 text-4xl font-black tracking-tight text-[#1a1a1a]">Urban Wash</h1>
        <div className="mt-4 flex items-center gap-2">
          <div className="h-1 w-1 rounded-full bg-primary" />
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Lucknow</p>
          <div className="h-1 w-1 rounded-full bg-primary" />
        </div>
        
        {/* Unmistakable diagnostic marker visible only in dev or via inspection */}
        <div className="fixed bottom-10 left-0 right-0 flex flex-col items-center gap-1 opacity-10 pointer-events-none">
          <span className="text-[10px] font-mono tracking-tighter">APP_START_TRACE_ACTIVE</span>
          <span className="text-[10px] font-mono tracking-tighter">STARTUP BUILD: {SPLASH_BUILD_ID}</span>
          <span className="text-[10px] font-mono tracking-tighter text-blue-500">ROUTE: /c (Splash)</span>
        </div>
      </div>
    </div>
  );
}
