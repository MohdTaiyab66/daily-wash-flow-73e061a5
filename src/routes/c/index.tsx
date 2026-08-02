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
          navigate({ to: savedArea ? "/c/home" : "/c/location", replace: true });
        } else {
          navigate({ to: "/c/auth", replace: true });
        }
      }, wait);
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary px-6 text-primary-foreground">
      <div className="-mt-16 flex flex-col items-center animate-scale-in">
        <img src={logo} alt="Urban Wash" className="h-20 w-20 rounded-3xl object-cover shadow-xl" />
        <h1 className="mt-6 text-5xl font-bold tracking-tight">Urban Wash</h1>
        <div className="mt-3 h-px w-40 bg-primary-foreground/30" />
        <p className="mt-4 text-center text-base font-medium opacity-95">Making Every Ride Shine</p>
      </div>
    </div>
  );
}
