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

function CustomerSplash() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (cancelled) return;
      const { data } = await supabase.auth.getSession();
      const isCustomer = data.session?.user?.email?.endsWith("@customer.urbanwash.app");
      const savedArea = typeof window !== "undefined" ? localStorage.getItem("uw_customer_area") : null;
      if (isCustomer && savedArea) {
        navigate({ to: "/c/home" });
      } else {
        navigate({ to: "/c/welcome" });
      }
    }, 2200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-primary text-primary-foreground flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center -mt-16 animate-in fade-in zoom-in duration-700">
        <img src={logo} alt="Urban Wash" className="h-20 w-20 rounded-2xl object-cover shadow-xl" />
        <h1 className="mt-6 text-5xl font-bold tracking-tight">Urban Wash</h1>
        <div className="mt-3 h-px w-40 bg-primary-foreground/30" />
        <p className="mt-4 text-center text-base font-medium opacity-95">
          Making Every Ride Shine
        </p>
      </div>
    </div>
  );
}
