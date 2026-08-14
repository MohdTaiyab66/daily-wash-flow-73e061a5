import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { sessionManager } from "@/lib/customer-auth-session";
import logo from "@/assets/logo.jpeg";

export const Route = createFileRoute("/c/")({
  ssr: true,
  head: () => ({
    meta: [
      { title: "Urban Wash — Doorstep Car Care" },
      { name: "description", content: "Daily doorstep car care in Lucknow." },
    ],
  }),
  component: CustomerSplash,
});

const MIN_SPLASH_MS = 500;

function CustomerSplash() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const resolveAuth = async () => {
      const session = await sessionManager.getSession();
      const isCustomer = sessionManager.isCustomer(session);
      
      if (cancelled) return;

      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      
      window.setTimeout(() => {
        if (cancelled) return;
        if (isCustomer) {
          const savedArea = localStorage.getItem("uw_customer_area");
          if (savedArea) {
            navigate({ to: "/c/home", replace: true });
          } else {
            navigate({ to: "/c/location/search", search: {} as any, replace: true });
          }
        } else {
          navigate({ to: "/c/auth", replace: true });
        }
      }, wait);
    };

    resolveAuth();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FFF9F3]">
      <div className="flex flex-col items-center gap-6 animate-in fade-in duration-700">
        <div className="relative">
          <div className="absolute -inset-4 bg-[#FF6B00]/10 rounded-full blur-xl animate-pulse" />
          <img 
            src={logo} 
            alt="Urban Wash" 
            className="w-24 h-24 rounded-3xl shadow-2xl relative z-10 border-4 border-white"
          />
        </div>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight">URBAN WASH</h1>
          <p className="text-[10px] font-bold text-[#FF6B00] uppercase tracking-[0.2em] opacity-80">Premium Car Care</p>
        </div>
      </div>
    </div>
  );
}
