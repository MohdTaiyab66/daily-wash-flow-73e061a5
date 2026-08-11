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
const MIN_SPLASH_MS = 700;

function CustomerSplash() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    (async () => {
      let isCustomer = false;
      try {
        const { data } = await supabase.auth.getSession();
        isCustomer = !!data.session?.user?.email?.endsWith("@customer.urbanwash.app");
      } catch {
        isCustomer = false; // auth/network failure → login, never a blank screen
      }
      if (cancelled) return;

      const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - startedAt));
      window.setTimeout(() => {
        if (cancelled) return;
        if (isCustomer) {
          const savedArea = localStorage.getItem("uw_customer_area");
          // If we have an area, go home. If not, go to location flow which starts at onboarding.
          navigate({ to: savedArea ? "/c/home" : "/c/location/search", replace: true });
        } else {
          navigate({ to: "/c/auth", replace: true });
        }
      }, wait);
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFF9F3] px-6">
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
      </div>
    </div>
  );
}
