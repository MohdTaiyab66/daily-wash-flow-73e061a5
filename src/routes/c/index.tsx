import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
const AUTH_TIMEOUT_MS = 2500;

function CustomerSplash() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    console.log("[STARTUP] [WEB] Splash component mounted at:", startedAt);

    const resolveAuth = async () => {
      let isCustomer = false;
      
      console.log("[STARTUP] [WEB] Starting auth check...");
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Auth check timed out")), AUTH_TIMEOUT_MS)
      );

      try {
        // We use getSession because it is much faster (local storage read) than getUser
        // getUser is expensive and requires a network call to Supabase.
        const authPromise = supabase.auth.getSession();
        const { data }: any = await Promise.race([authPromise, timeoutPromise]);
        
        console.log("[STARTUP] [WEB] Auth check completed. Session present:", !!data.session);
        
        isCustomer = !!data.session?.user?.email?.endsWith("@customer.urbanwash.app");
      } catch (err) {
        console.warn("[STARTUP] [WEB] Auth check failed or timed out:", err);
        isCustomer = false; 
      }

      if (cancelled) return;

      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      
      console.log(`[STARTUP] [WEB] Routing in ${wait}ms. Target isCustomer:`, isCustomer);
      
      window.setTimeout(() => {
        if (cancelled) return;
        console.log("[STARTUP] [WEB] Executing navigation...");
        if (isCustomer) {
          const savedArea = localStorage.getItem("uw_customer_area");
          navigate({ to: savedArea ? "/c/home" : "/c/location/search", replace: true });
        } else {
          navigate({ to: "/c/auth", replace: true });
        }
      }, wait);
    };

    resolveAuth();

    return () => { 
      console.log("[STARTUP] [WEB] Splash component unmounting");
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
        <div className="fixed bottom-10 left-0 right-0 flex justify-center opacity-10 pointer-events-none">
          <span className="text-[10px] font-mono">APP_START_TRACE_ACTIVE</span>
        </div>
      </div>
    </div>
  );
}
